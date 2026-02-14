const path = require("path");
const { FlatCompat } = require("@eslint/eslintrc");

const compat = new FlatCompat({
  baseDirectory: __dirname,
  resolvePluginsRelativeTo: path.join(__dirname, "node_modules", "eslint-config-expo"),
});

module.exports = [
  {
    ignores: ["eslint.config.js"],
  },
  ...compat.extends("expo"),
  {
    rules: {
      "react/react-in-jsx-scope": "off",
    },
  },
];
