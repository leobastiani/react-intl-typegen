# react-intl-typegen

Generate TypeScript types for your react-intl translations.

## Example

```bash
npx -y react-intl-typegen@latest ./src/assets/translations/pt-BR/translations.json ./src/assets/translations/en-US/translations.json -o b,i > src/react-intl-custom.d.ts
```

Then, add to your tsconfig.json

```json
{
  // ...
  "paths": {
    // ...
    "react-intl-orig": ["../node_modules/react-intl"],
    "react-intl": ["./react-intl-custom"]
    // ...
  }
  // ...
}
```
