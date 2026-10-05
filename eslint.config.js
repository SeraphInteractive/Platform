import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
    { ignores: ["**/dist/**", "**/node_modules/**", "apps/api/drizzle/**", "**/*.config.ts", "eslint.config.js", "apps/web/**"] },
    eslint.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                project: ["./tsconfig.eslint.json"],
                tsconfigRootDir: import.meta.dirname
            }
        },
        rules: {
            "@typescript-eslint/explicit-member-accessibility": [
                "error",
                { accessibility: "explicit", overrides: { constructors: "explicit" } }
            ],
            "@typescript-eslint/explicit-function-return-type": ["error", { allowExpressions: true, allowTypedFunctionExpressions: true }],
            "@typescript-eslint/naming-convention": [
                "error",
                { selector: "default", format: ["camelCase"], leadingUnderscore: "allow" },
                { selector: "import", format: ["camelCase", "PascalCase"] },
                { selector: "typeLike", format: ["PascalCase"] },
                { selector: "enumMember", format: ["PascalCase"] },
                { selector: ["objectLiteralProperty", "typeProperty"], format: null },
                { selector: "variable", modifiers: ["destructured"], format: null }
            ],
            "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
            "@typescript-eslint/no-floating-promises": "error",
            "@typescript-eslint/require-await": "off",
            "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
            "@typescript-eslint/no-non-null-assertion": "error",
            "@typescript-eslint/non-nullable-type-assertion-style": "off",
            eqeqeq: ["error", "always"],
            "no-console": "error",
            curly: ["error", "all"]
        }
    },
    {
        files: ["**/test/**/*.ts"],
        rules: {
            "@typescript-eslint/no-unsafe-assignment": "off",
            "@typescript-eslint/no-unsafe-member-access": "off",
            "@typescript-eslint/no-unsafe-argument": "off",
            "@typescript-eslint/no-unnecessary-type-parameters": "off",
            "@typescript-eslint/no-non-null-assertion": "off",
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-unused-vars": "off"
        }
    },
    {
        rules: {
            "@typescript-eslint/no-unsafe-enum-assignment": "off",
            "@typescript-eslint/no-deprecated": "off",
            "@typescript-eslint/no-unnecessary-condition": "off",
            "@typescript-eslint/no-non-null-assertion": "off",
            "@typescript-eslint/use-unknown-in-catch-callback-variable": "off",
            "@typescript-eslint/prefer-optional-chain": "off",
            "no-control-regex": "off"
        }
    }
);
