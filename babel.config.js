module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["@react-native/babel-preset"],
    plugins: [
      [
        "module-resolver",
        {
          root: ["."],
          alias: {
            "@": "./src",
          },
        },
      ],
      "react-native-reanimated/plugin",
    ],
  };
};
