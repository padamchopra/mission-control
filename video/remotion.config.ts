/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";
import { enableTailwind } from '@remotion/tailwind-v4';

Config.setRspack(true);
// PNG rather than the scaffold's JPEG: JPEG frames make ffmpeg pick the
// full-range `yuvj420p`, which some players stretch the contrast of. Flat light
// UI is exactly where that shows, so the intermediate stays lossless and the
// output lands on the limited-range `yuv420p` every platform expects.
Config.setVideoImageFormat("png");
Config.setOverwriteOutput(true);
Config.overrideBundlerConfig(enableTailwind);
