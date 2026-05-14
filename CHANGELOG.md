# Changelog

## [1.0.1](https://github.com/bamcmanus/bazel-diff/compare/v1.0.0...v1.0.1) (2026-05-14)


### Bug Fixes

* use app token for post-release checkout to bypass tag protection ([#9](https://github.com/bamcmanus/bazel-diff/issues/9)) ([1d27062](https://github.com/bamcmanus/bazel-diff/commit/1d270625795a3cabb114553d1213aaf1d3e5e8cb))

## 1.0.0 (2026-05-14)

### Features

- add release automation and commit validation
  ([#2](https://github.com/bamcmanus/bazel-diff/issues/2))
  ([0f3d06c](https://github.com/bamcmanus/bazel-diff/commit/0f3d06c9e924378149fb437e9716e6a6de8815bd))
- use GHA for release workflow
  ([#5](https://github.com/bamcmanus/bazel-diff/issues/5))
  ([3ecb660](https://github.com/bamcmanus/bazel-diff/commit/3ecb6601c0b6828b4c1a71316b07f0dec9529e28))

### Bug Fixes

- correct release workflow GHA dependencies
  ([#6](https://github.com/bamcmanus/bazel-diff/issues/6))
  ([27d6797](https://github.com/bamcmanus/bazel-diff/commit/27d6797f5469f5047d642a64a047b6b0e6157861))
- correct release-please-action SHA pin
  ([#3](https://github.com/bamcmanus/bazel-diff/issues/3))
  ([378322f](https://github.com/bamcmanus/bazel-diff/commit/378322fc6d0a8fe87adbed2aed2f6fa6d931a799))
- run prettier on release-please PRs
  ([#8](https://github.com/bamcmanus/bazel-diff/issues/8))
  ([d4ef3f7](https://github.com/bamcmanus/bazel-diff/commit/d4ef3f710c7bd69c119abba65f10a0012ce6a1e3))
- use client-id instead of deprecated app-id for create-github-app-token v3
  ([#7](https://github.com/bamcmanus/bazel-diff/issues/7))
  ([14b315e](https://github.com/bamcmanus/bazel-diff/commit/14b315e7871e745d3e3e0d2de25faf17783b68e3))
