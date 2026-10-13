import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin'
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin'
import { MotionPathPlugin } from 'gsap/MotionPathPlugin'
import { CustomEase } from 'gsap/CustomEase'

gsap.registerPlugin(ScrollTrigger, SplitText, ScrambleTextPlugin, DrawSVGPlugin, MotionPathPlugin, CustomEase)
CustomEase.create('hud', '0.7,0,0.2,1')

export { gsap, ScrollTrigger, SplitText }

/** Scene context handed to every scene builder (runs inside gsap.matchMedia, so revert is automatic). */
export interface SceneCtx { desktop: boolean }

export const SCRAMBLE = '01░▒▓/\\<>#'
