import js from "@eslint/js";
import prettier from "eslint-config-prettier";

export default [
  js.configs.recommended,
  prettier,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        process: "readonly",
      },
    },
  },
  {
    files: ["src/**/*.test.js"],
    languageOptions: {
      globals: {
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterAll: "readonly",
        Buffer: "readonly",
        process: "readonly",
      },
    },
  },
  {
    ignores: ["dist/"],
  },
];
