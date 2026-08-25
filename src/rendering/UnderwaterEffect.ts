/**
 * UnderwaterEffect — a postprocessing Effect that blends a blue-green tint
 * and mild vignette darkening over the frame, standing in for the visual
 * change of being underwater. Opacity is driven every frame by the caller
 * from player.underwaterDepthFraction (0 = dry/at surface, 1 = full dive
 * depth) — at 0 opacity the effect is fully transparent (no visible change).
 *
 * Uses BlendFunction.NORMAL (straight alpha-blend by opacity) rather than
 * the Effect base class's default SCREEN blend, since mainImage() below
 * already computes the final blended color itself — SCREEN would double up
 * the brightening on top of that.
 */
import { Effect, BlendFunction } from 'postprocessing';

export class UnderwaterEffect extends Effect {
  constructor() {
    super(
      'UnderwaterEffect',
      /* glsl */ `
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 tint = vec3(0.05, 0.25, 0.35);
        float vignette = smoothstep(0.9, 0.35, distance(uv, vec2(0.5)));
        vec3 color = mix(inputColor.rgb, tint, 0.35) * mix(1.0, vignette, 0.4);
        outputColor = vec4(color, inputColor.a);
      }
    `,
      { blendFunction: BlendFunction.NORMAL },
    );
  }
}
