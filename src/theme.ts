import { createTheme } from "@mantine/core";
import type { MantineColorsTuple } from "@mantine/core";

const amber: MantineColorsTuple = [
  "#fff8e1",
  "#ffecb3",
  "#ffe082",
  "#ffd54f",
  "#ffca28",
  "#ffc107",
  "#ffb300",
  "#ffa000",
  "#ff8f00",
  "#ff6f00",
];

const signal: MantineColorsTuple = [
  "#e8f5e9",
  "#c8e6c9",
  "#a5d6a7",
  "#81c784",
  "#66bb6a",
  "#4caf50",
  "#43a047",
  "#388e3c",
  "#2e7d32",
  "#1b5e20",
];

export const theme = createTheme({
  primaryColor: "amber",
  colors: {
    amber,
    signal,
    dark: [
      "#c9c9c9",
      "#b8b8b8",
      "#828282",
      "#696969",
      "#424242",
      "#3b3b3b",
      "#2e2e2e",
      "#1f1f1f",
      "#171717",
      "#0e0e0e",
    ],
  },
  fontFamily: '"Instrument Sans", sans-serif',
  fontFamilyMonospace:
    '"JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  defaultRadius: "sm",
  headings: {
    fontFamily: '"Instrument Sans", sans-serif',
    fontWeight: "600",
  },
});
