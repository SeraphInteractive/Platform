import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

export default tseslint.config(
    { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "src/Components/Ui/**", "*.config.*", "eslint.config.mjs"] },
    ...nextVitals,
    ...nextTypeScript,
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    {
        settings: { react: { version: "19.3" } },
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname
            }
        },
        rules: {
            "@typescript-eslint/explicit-function-return-type": "off",
            "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
            "@typescript-eslint/no-floating-promises": "error",
            "@typescript-eslint/require-await": "off",
            "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
            "@typescript-eslint/no-non-null-assertion": "off",
            "@typescript-eslint/non-nullable-type-assertion-style": "off",
            "@typescript-eslint/no-unsafe-enum-assignment": "off",
            "@typescript-eslint/no-deprecated": "off",
            "@typescript-eslint/no-unnecessary-condition": "off",
            "@typescript-eslint/use-unknown-in-catch-callback-variable": "off",
            "@typescript-eslint/prefer-optional-chain": "off",
            "@typescript-eslint/no-confusing-void-expression": "off",
            "@typescript-eslint/no-unused-vars": "off",
            "@typescript-eslint/no-unnecessary-type-assertion": "off",
            "@typescript-eslint/prefer-regexp-exec": "off",
            "@typescript-eslint/no-misused-promises": "off",
            "@typescript-eslint/prefer-nullish-coalescing": "off",
            "@typescript-eslint/no-inferrable-types": "off",
            "react-hooks/set-state-in-effect": "off",
            "react-hooks/exhaustive-deps": "off",
            "@next/next/no-img-element": "off",
            eqeqeq: ["error", "always"],
            "no-console": "error",
            curly: "off"
        }
    }
);
