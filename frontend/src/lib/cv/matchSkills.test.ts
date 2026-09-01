import { describe, it, expect } from "vitest";
import { matchSkillsInText, type SkillTerm } from "./matchSkills";

const TAXONOMY: SkillTerm[] = [
  { id: 1, name: "Machine learning", aliases: ["ml", "sklearn", "scikit-learn", "artificial intelligence"] },
  { id: 2, name: "Full-stack dev", aliases: ["fullstack", "full stack", "full-stack development"] },
  { id: 3, name: "R (statistics)", aliases: ["r programming", "rstudio", "tidyverse"] },
  { id: 4, name: "Cloud engineering", aliases: ["gcp", "aws", "azure devops"] },
];

describe("matchSkillsInText", () => {
  it("matches on the canonical name and on an alias", () => {
    const ids = matchSkillsInText(
      "Skills: Python, Machine learning, PyTorch, full-stack development",
      TAXONOMY,
    );
    expect(ids).toEqual([1, 2]);
  });

  it("does not let a short canonical name match inside unrelated words", () => {
    // The exact failure mode the taxonomy's "no name shorter than 3 chars"
    // rule exists to prevent: "R" must not match inside "results".
    const ids = matchSkillsInText(
      "This candidate has previous experience and strong results.",
      TAXONOMY,
    );
    expect(ids).toEqual([]);
  });

  it("still matches the same skill via a longer alias", () => {
    const ids = matchSkillsInText("Comfortable in RStudio and the tidyverse.", TAXONOMY);
    expect(ids).toEqual([3]);
  });

  it("matches an alias case-insensitively", () => {
    const ids = matchSkillsInText("Deployed on GCP with Terraform.", TAXONOMY);
    expect(ids).toEqual([4]);
  });

  it("returns nothing for empty or irrelevant text", () => {
    expect(matchSkillsInText("", TAXONOMY)).toEqual([]);
    expect(matchSkillsInText("Just a cover letter with no skills section.", TAXONOMY)).toEqual([]);
  });

  it("never returns a duplicate id even when both name and alias appear", () => {
    const ids = matchSkillsInText("Machine learning, ML, and more ML work.", TAXONOMY);
    expect(ids).toEqual([1]);
  });
});
