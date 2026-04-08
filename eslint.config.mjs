import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfiguration = [
  ...nextVitals,
  {
    ignores: ["worker/**", "src/generated/**"],
  },
];

export default eslintConfiguration;
