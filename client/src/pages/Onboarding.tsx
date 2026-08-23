import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DetailsStep } from "../components/onboarding/DetailsStep";
import { LogoStep } from "../components/onboarding/LogoStep";
import { OnboardingLayout } from "../components/onboarding/OnboardingLayout";
import { apiRequest } from "../lib/apiClient";

type Step = "details" | "logo";

export default function Onboarding() {
  const [step, setStep] = useState<Step>("details");
  const navigate = useNavigate();

  async function goToDashboard() {
    try {
      await apiRequest("/business/onboarding/complete", { method: "POST" });
    } catch {
      // Not fatal: onboarding may just be re-shown on the next login.
    }
    navigate("/dashboard");
  }

  return (
    <OnboardingLayout stepLabel={step === "details" ? "Step 1 of 2" : "Step 2 of 2"} onSkipAll={goToDashboard}>
      {step === "details" ? (
        <DetailsStep onComplete={() => setStep("logo")} />
      ) : (
        <LogoStep onComplete={goToDashboard} />
      )}
    </OnboardingLayout>
  );
}
