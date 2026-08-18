import { motion } from "framer-motion";
import { useState, type ChangeEvent } from "react";
import { Button } from "../Button";
import { API_BASE_URL, apiRequest, ApiError } from "../../lib/apiClient";

interface LogoStepProps {
  onComplete: () => void;
}

type LogoStepState =
  | { phase: "upload" }
  | { phase: "processing" }
  | {
      phase: "review";
      url: string;
      primaryColor: string;
      accentColors: string[];
      contrastRatio: number;
    };

export function LogoStep({ onComplete }: LogoStepProps) {
  const [state, setState] = useState<LogoStepState>({ phase: "upload" });
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploadError(null);
    setApiError(null);
    setState({ phase: "processing" });

    const formData = new FormData();
    formData.append("logo", file);

    try {
      const uploaded = await apiRequest<{ url: string }>("/business/logo", {
        method: "POST",
        body: formData,
      });

      const removed = await apiRequest<{ url: string; backgroundRemoved: boolean }>(
        "/business/logo/remove-background",
        { method: "POST", body: { url: uploaded.url } },
      );

      const palette = await apiRequest<{ primaryColor: string; accentColors: string[]; contrastRatio: number }>(
        "/business/logo/extract-colors",
        { method: "POST", body: { url: removed.url } },
      );

      setState({
        phase: "review",
        url: removed.url,
        primaryColor: palette.primaryColor,
        accentColors: palette.accentColors,
        contrastRatio: palette.contrastRatio,
      });
    } catch (err) {
      setState({ phase: "upload" });
      if (err instanceof ApiError && err.status === 400) {
        setUploadError("That file couldn't be used. Try a PNG, JPEG, or WebP under 5MB.");
      } else {
        setUploadError("Something went wrong uploading that logo. Try again.");
      }
    }
  }

  async function handleConfirm() {
    if (state.phase !== "review") return;
    setApiError(null);
    setIsConfirming(true);
    try {
      await apiRequest("/business/logo/confirm", {
        method: "POST",
        body: { url: state.url, primaryColor: state.primaryColor, accentColors: state.accentColors },
      });
      onComplete();
    } catch {
      setApiError("Couldn't save your logo. Try again.");
      setIsConfirming(false);
    }
  }

  function handleTryDifferentLogo() {
    setState({ phase: "upload" });
    setIsAdjusting(false);
  }

  function updatePrimaryColor(value: string) {
    setState((current) => (current.phase === "review" ? { ...current, primaryColor: value } : current));
  }

  function updateAccentColor(index: number, value: string) {
    setState((current) => {
      if (current.phase !== "review") return current;
      const accentColors = current.accentColors.map((color, i) => (i === index ? value : color));
      return { ...current, accentColors };
    });
  }

  function removeAccentColor(index: number) {
    setState((current) => {
      if (current.phase !== "review") return current;
      return { ...current, accentColors: current.accentColors.filter((_, i) => i !== index) };
    });
  }

  return (
    <div>
      <h2 className="font-display text-2xl font-semibold text-neutral-900">Add your logo</h2>
      <p className="mt-2 font-sans text-sm text-neutral-600">
        We'll remove the background and pick your brand colors automatically.
      </p>

      {apiError && (
        <div className="mt-4 rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
          {apiError}
        </div>
      )}

      {state.phase === "upload" && (
        <div className="mt-8">
          <label
            htmlFor="logo-upload"
            className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-200 px-6 py-12 text-center transition-colors hover:border-primary-500"
          >
            <span className="font-sans text-sm font-medium text-neutral-800">Click to upload your logo</span>
            <span className="mt-1 font-sans text-xs text-neutral-400">PNG, JPEG, or WebP, up to 5MB</span>
          </label>
          <input
            id="logo-upload"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={handleFileChange}
          />
          {uploadError && (
            <p className="mt-2 font-sans text-sm text-error" role="alert">
              {uploadError}
            </p>
          )}
        </div>
      )}

      {state.phase === "processing" && (
        <div className="mt-8 flex flex-col items-center justify-center gap-4 py-12">
          <motion.span
            animate={{ rotate: 360 }}
            transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
            className="h-8 w-8 rounded-full border-2 border-primary-100 border-t-primary-500"
            aria-hidden="true"
          />
          <p className="font-sans text-sm text-neutral-600">Setting up your logo…</p>
        </div>
      )}

      {state.phase === "review" && (
        <div className="mt-8 flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 p-6">
              <img
                src={`${API_BASE_URL}${state.url}`}
                alt="Your logo on a light background"
                className="h-16 w-16 object-contain"
              />
            </div>
            <div className="flex items-center justify-center rounded-xl bg-primary-500 p-6">
              <img
                src={`${API_BASE_URL}${state.url}`}
                alt="Your logo on your brand color"
                className="h-16 w-16 object-contain"
              />
            </div>
          </div>

          <div>
            <p className="font-sans text-sm font-medium text-neutral-800">Primary color</p>
            <div className="mt-2 flex items-center gap-3">
              {isAdjusting ? (
                <input
                  type="color"
                  aria-label="Primary color"
                  value={state.primaryColor}
                  onChange={(e) => updatePrimaryColor(e.target.value)}
                  className="h-9 w-9 cursor-pointer rounded-md border border-neutral-200"
                />
              ) : (
                <span
                  aria-label="Primary color"
                  className="h-9 w-9 rounded-md border border-neutral-200"
                  style={{ backgroundColor: state.primaryColor }}
                />
              )}
              <span className="font-sans text-xs text-neutral-400">{state.primaryColor}</span>
            </div>
            <p className="mt-2 font-sans text-xs text-neutral-400">
              Contrast ratio: {state.contrastRatio.toFixed(1)}:1
            </p>

            {state.accentColors.length > 0 && (
              <>
                <p className="mt-4 font-sans text-sm font-medium text-neutral-800">Accent colors</p>
                <div className="mt-2 flex flex-wrap gap-3">
                  {state.accentColors.map((color, index) => (
                    <div key={`${color}-${index}`} className="flex items-center gap-1.5">
                      {isAdjusting ? (
                        <input
                          type="color"
                          aria-label={`Accent color ${index + 1}`}
                          value={color}
                          onChange={(e) => updateAccentColor(index, e.target.value)}
                          className="h-9 w-9 cursor-pointer rounded-md border border-neutral-200"
                        />
                      ) : (
                        <span
                          aria-label={`Accent color ${index + 1}`}
                          className="h-9 w-9 rounded-md border border-neutral-200"
                          style={{ backgroundColor: color }}
                        />
                      )}
                      {isAdjusting && (
                        <button
                          type="button"
                          onClick={() => removeAccentColor(index)}
                          aria-label={`Remove accent color ${index + 1}`}
                          className="text-neutral-400 hover:text-neutral-600"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <Button type="button" isLoading={isConfirming} onClick={handleConfirm}>
              Use these colors
            </Button>
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => setIsAdjusting((v) => !v)}
                className="font-sans text-sm text-neutral-500 hover:text-neutral-700 hover:underline"
              >
                {isAdjusting ? "Done adjusting" : "Adjust colors"}
              </button>
              <button
                type="button"
                onClick={handleTryDifferentLogo}
                className="font-sans text-sm text-neutral-500 hover:text-neutral-700 hover:underline"
              >
                Try a different logo
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onComplete}
        className="mt-6 font-sans text-sm text-neutral-500 hover:text-neutral-700 hover:underline"
      >
        Skip this step
      </button>
    </div>
  );
}
