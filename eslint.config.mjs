import { config } from "@remotion/eslint-config-flat";

export default [
  ...config,
  {
    ignores: [
      "src/features/editor/**",
      "src/components/color-picker/**",
      "src/components/shared/**",
      "src/components/ui/**",
      "src/components/modal-upload.tsx",
      "src/components/store-initializer.tsx",
      "src/hooks/**",
      "src/store/**",
      "src/utils/**",
    ],
  },
];
