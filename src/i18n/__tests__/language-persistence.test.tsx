import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { useTranslation } from "react-i18next";
import "@/i18n";

function Probe() {
  const { t, i18n } = useTranslation();
  return (
    <div>
      <span data-testid="lang">{i18n.language}</span>
      <span data-testid="home">{t("nav.home")}</span>
      <span data-testid="html-lang">{document.documentElement.lang}</span>
    </div>
  );
}

describe("Language switching end-to-end", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("changes UI text across all consumers when language changes", async () => {
    const { rerender } = render(<Probe />);
    const { default: i18n } = await import("@/i18n");

    await act(async () => {
      await i18n.changeLanguage("en");
    });
    rerender(<Probe />);
    expect(screen.getByTestId("lang").textContent).toBe("en");
    expect(screen.getByTestId("home").textContent?.toLowerCase()).toMatch(/home/);

    await act(async () => {
      await i18n.changeLanguage("ru");
    });
    rerender(<Probe />);
    expect(screen.getByTestId("home").textContent).toMatch(/Главная|Дом/i);

    await act(async () => {
      await i18n.changeLanguage("uz");
    });
    rerender(<Probe />);
    // Uzbek home label
    expect(screen.getByTestId("home").textContent).toBeTruthy();
  });

  it("persists language to localStorage under alsamos-language key", async () => {
    const { default: i18n } = await import("@/i18n");
    await act(async () => {
      await i18n.changeLanguage("ru");
    });
    expect(localStorage.getItem("alsamos-language")).toBe("ru");
  });

  it("syncs document.documentElement.lang", async () => {
    const { default: i18n } = await import("@/i18n");
    await act(async () => {
      await i18n.changeLanguage("en");
    });
    expect(document.documentElement.lang).toBe("en");
  });
});
