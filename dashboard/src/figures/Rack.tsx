/*
  The ghost-and-lamp figure uses geometry and the projection method of
  iso-glow / ai-iso-skill: https://github.com/MrBongoC/ai-iso-skill

  MIT License
  Copyright (c) 2026 Tolga Cohce

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.

  Changes: colours moved to the dashboard's tokens, motion redone as CSS
  keyframes, the ghost and its cards are trckable's own.
  Changes: colours moved to the dashboard's tokens, the original interactivity
  removed, motion redone as CSS keyframes.
*/
import { Markup } from './Markup'
import { attachRack } from './rack.interact'
import { rackMarkup } from './rack.art'
import './figures.css'
import './rack.css'

/** The server rack: one red LED, unit 04 down. */
export default function Rack() {
  return <Markup html={rackMarkup} attach={attachRack} />
}
