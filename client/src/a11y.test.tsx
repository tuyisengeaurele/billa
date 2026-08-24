import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { axe } from "./test/axe";
import { AuthProvider } from "./context/AuthContext";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";

vi.mock("./lib/firebaseAuth", () => ({
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOutFirebase: vi.fn(),
  resetPassword: vi.fn(),
  firebaseErrorCode: () => null,
}));

function renderWithProviders(path: string, element: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path={path} element={element} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("accessibility", () => {
  it("Landing page has no automatically-detectable a11y violations", async () => {
    const { container } = render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Login page has no automatically-detectable a11y violations", async () => {
    const { container } = renderWithProviders("/login", <Login />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Register page has no automatically-detectable a11y violations", async () => {
    const { container } = renderWithProviders("/register", <Register />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
