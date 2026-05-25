module.exports = {
  root: true,
  extends: ['@react-native', 'plugin:react-native-a11y/all'],
  overrides: [
    {
      files: ['__tests__/**/*.{ts,tsx}'],
      rules: {
        'react-native-a11y/has-accessibility-hint': 'off',
      },
    },
  ],
};
