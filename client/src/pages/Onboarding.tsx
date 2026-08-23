import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
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
      <motion.div
        key={step}
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
        {step === "details" ? (
          <DetailsStep onComplete={() => setStep("logo")} />
        ) : (
          <LogoStep onComplete={goToDashboard} />
        )}
      </motion.div>
    </OnboardingLayout>
  );
}
