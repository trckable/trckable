// The globe's surface as a picture: NASA's Blue Marble by day and Black Marble (the lights of the cities) by night, drawn on a sphere by a
// small WebGL2 shader into a canvas of its own, which the engine then copies under the borders, names and markers. The sun is where it really
// is now, so the lit side and the night side are the real ones. No library: one full-canvas quad and a fragment shader that turns each pixel
// of the disc back into a longitude and latitude. Without WebGL2, or if a picture does not arrive, there is no skin and the engine draws the
// vector earth instead. The pictures are NASA Earth Observatory's, public domain.
import day2k from './skin/day-2048.webp?url'
import day4k from './skin/day-4096.webp?url'
import night2k from './skin/night-2048.webp?url'

const RAD = Math.PI / 180

const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)) * 2.0 - 1.0;
  gl_Position = vec4(p, 0.0, 1.0);
}`

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_day;
uniform sampler2D u_night;
uniform vec2 u_c;
uniform float u_r;
uniform vec4 u_rot;
uniform vec3 u_sun;
uniform float u_lod;
uniform float u_amb;
out vec4 o;
void main() {
  vec2 p = (gl_FragCoord.xy - u_c) / u_r;
  float rho2 = dot(p, p);
  if (rho2 > 1.0 + 4.0 / u_r) { o = vec4(0.0); return; }
  float edge = clamp((1.0 - sqrt(rho2)) * u_r, 0.0, 1.0);
  float z = sqrt(max(0.0, 1.0 - rho2));
  // The point of the sphere under this pixel, turned back from the view to the earth.
  float y = p.y * u_rot.z + z * u_rot.w;
  float z1 = z * u_rot.z - p.y * u_rot.w;
  vec3 a = vec3(p.x * u_rot.x + z1 * u_rot.y, y, z1 * u_rot.x - p.x * u_rot.y);
  vec2 uv = vec2(atan(a.x, a.z) / 6.2831853 + 0.5, 0.5 - asin(clamp(a.y, -1.0, 1.0)) / 3.1415927);
  float lod = u_lod + (1.0 - z) * 0.9;
  vec3 day = textureLod(u_day, uv, lod).rgb;
  vec3 night = textureLod(u_night, uv, u_lod).rgb;
  float lit = dot(a, u_sun);
  float d = smoothstep(-0.12, 0.2, lit);
  // Day: the picture, a little brighter near the sun. Night: dim land and the lights, warm.
  vec3 col = day * (0.8 + 0.4 * d) * d;
  col += (day * u_amb + night * vec3(1.5, 1.15, 0.7) * 1.5) * (1.0 - d);
  // The air at the edge of the disc, bright on the lit side.
  float f = pow(1.0 - z, 3.0);
  col += vec3(0.28, 0.55, 1.0) * f * (0.2 + 0.8 * d) * 0.7;
  o = vec4(col * edge, edge);
}`

export interface SkinView {
  lat: number
  lon: number
  /** The disc's middle and radius, in CSS pixels from the top left of the canvas. */
  cx: number
  cy: number
  r: number
  w: number
  h: number
  dpr: number
}

/** A GL object that was made (the call gives null when the context is lost). */
function need<T>(v: T | null): T {
  if (!v) throw new Error('gl')
  return v
}

function load(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => res(img)
    img.onerror = () => rej(new Error('image'))
    img.src = url
  })
}

export class Skin {
  readonly canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext
  private prog: WebGLProgram
  private day: WebGLTexture
  private night: WebGLTexture
  private width = 2048
  private high = false
  private u: Record<string, WebGLUniformLocation | null> = {}

  private constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext, prog: WebGLProgram, day: WebGLTexture, night: WebGLTexture) {
    this.canvas = canvas
    this.gl = gl
    this.prog = prog
    this.day = day
    this.night = night
    for (const n of ['u_day', 'u_night', 'u_c', 'u_r', 'u_rot', 'u_sun', 'u_lod', 'u_amb']) this.u[n] = gl.getUniformLocation(prog, n)
  }

  /** The skin with its first pictures (2048 wide), or null where WebGL2 is missing or only in software, or a picture does not arrive. `force` skips the software check (the tests' screenshots). */
  static async create(force = false): Promise<Skin | null> {
    try {
      const c = document.createElement('canvas')
      const gl = c.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false })
      if (!gl) return null
      // A software renderer (no graphics chip) would draw the sphere on the processor, far too slowly: the vector earth is lighter there.
      const info = gl.getExtension('WEBGL_debug_renderer_info')
      if (!force && info && /swiftshader|llvmpipe|softpipe|software/i.test(String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)))) return null
      const sh = (type: number, src: string) => {
        const s = need(gl.createShader(type))
        gl.shaderSource(s, src)
        gl.compileShader(s)
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader')
        return s
      }
      const prog = need(gl.createProgram())
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT))
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG))
      gl.linkProgram(prog)
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('program')
      const [dayImg, nightImg] = await Promise.all([load(day2k), load(night2k)])
      const skin = new Skin(c, gl, prog, need(gl.createTexture()), need(gl.createTexture()))
      skin.upload(skin.day, dayImg)
      skin.upload(skin.night, nightImg)
      return skin
    } catch {
      return null
    }
  }

  private upload(tex: WebGLTexture, img: HTMLImageElement) {
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  }

  /** Swaps the day picture for the 4096 one (once; resolves true when it is in). */
  async sharpen(): Promise<boolean> {
    if (this.high) return false
    this.high = true
    try {
      this.upload(this.day, await load(day4k))
      this.width = 4096
      return true
    } catch {
      return false
    }
  }

  /** Draws the disc into this canvas (sized to the view). */
  render(v: SkinView, sun: readonly [number, number, number], ambient: number) {
    const gl = this.gl
    const W = Math.round(v.w * v.dpr)
    const H = Math.round(v.h * v.dpr)
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W
      this.canvas.height = H
    }
    gl.viewport(0, 0, W, H)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(this.prog)
    const R = v.r * v.dpr
    gl.uniform2f(this.u.u_c, v.cx * v.dpr, H - v.cy * v.dpr)
    gl.uniform1f(this.u.u_r, R)
    gl.uniform4f(this.u.u_rot, Math.cos(v.lon * RAD), Math.sin(v.lon * RAD), Math.cos(v.lat * RAD), Math.sin(v.lat * RAD))
    gl.uniform3f(this.u.u_sun, sun[0], sun[1], sun[2])
    // One pixel is 1/R of a radian: a texel is 2pi/width of one, so this many texels fall in a pixel (the mip level is its log).
    gl.uniform1f(this.u.u_lod, Math.max(0, Math.log2(this.width / (2 * Math.PI * R))))
    gl.uniform1f(this.u.u_amb, ambient)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.day)
    gl.uniform1i(this.u.u_day, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.night)
    gl.uniform1i(this.u.u_night, 1)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }
}
