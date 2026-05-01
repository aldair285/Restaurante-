// craco.config.js
const path = require("path");

module.exports = {
  eslint: {
    configure: {
      rules: {
        "react-hooks/exhaustive-deps": "warn",
      },
    },
  },
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
};
