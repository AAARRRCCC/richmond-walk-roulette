import { useCallback, useEffect, useState } from "react";
import { describeGeolocationError, judgeFix, type PermissionHint } from "../lib/locate";
import type { Origin } from "../data/places";
import type { LocationNotice } from "../lib/locate";

type Args = {
  /** Non-null while a notice is standing; a press then forces a fresh fix. */
  notice: LocationNotice | null;
  onOrigin: (origin: Origin) => void;
  onNotice: (notice: LocationNotice | null) => void;
};

/**
 * "Use my location". The Permissions API result is a hint for the label and
 * one early return, never a gate: Safari reports "prompt" where others report
 * nothing, and a browser without the API stays "unknown".
 */
export function useLocate(args: Args) {
  const [locating, setLocating] = useState(false);
  const [permissionHint, setPermissionHint] = useState<PermissionHint>("unknown");

  useEffect(() => {
    let status: PermissionStatus | null = null;
    const onChange = (): void => {
      if (status !== null) setPermissionHint(status.state);
    };
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((result) => {
        status = result;
        setPermissionHint(result.state);
        result.addEventListener("change", onChange);
      })
      .catch(() => {});
    return () => status?.removeEventListener("change", onChange);
  }, []);

  const { notice, onOrigin, onNotice } = args;
  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) {
      onNotice({
        message: "This browser can't share a location. Drop a pin on the map instead.",
        tone: "warn",
        suggest: null,
      });
      return;
    }
    if (permissionHint === "denied") {
      onNotice(describeGeolocationError(1, window.isSecureContext));
      return;
    }

    // A cached fix keeps its original accuracy, so a retry after a refusal must not replay it.
    const retry = notice !== null;
    setLocating(true);
    onNotice(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const outcome = judgeFix({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
        });
        if (outcome.kind === "rejected") {
          onNotice(outcome.error);
          return;
        }
        // The origin action clears the notice, so the caveat goes after it.
        onOrigin(outcome.origin);
        if (outcome.caveat !== null) onNotice(outcome.caveat);
      },
      (error) => {
        setLocating(false);
        onNotice(describeGeolocationError(error.code, window.isSecureContext));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: retry ? 0 : 60_000 },
    );
  }, [permissionHint, notice, onOrigin, onNotice]);

  return { locate, locating, permissionHint };
}
