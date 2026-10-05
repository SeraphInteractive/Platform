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
            "@typescript-eslint/explicit-function-return-type": ["error", { allowExpressions: true, allowTypedFunctionExpressions: true }],
            "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
            "@typescript-eslint/no-floating-promises": "error",
            "@typescript-eslint/require-await": "off",
            "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
            "@typescript-eslint/no-non-null-assertion": "error",
            "@typescript-eslint/non-nullable-type-assertion-style": "off",
            "@next/next/no-img-element": "off",
            eqeqeq: ["error", "always"],
            "no-console": "error",
            curly: ["error", "all"]
        }
    }
);
