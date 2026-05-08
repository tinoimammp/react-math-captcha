/**
 * Math challenge generator.
 *
 * Rules (per README philosophy: human-friendly):
 * - Addition:    a + b <= 100, both a,b in [1..99]
 * - Subtraction: a >= b (no negative results), a in [1..99]
 * - Multiplication: a * b <= 100, both a,b in [2..10]
 */

export type Operator = '+' | '-' | '*'

export interface Challenge {
  a: number
  b: number
  operator: Operator
  answer: number
  display: string
}

export interface GeneratorOptions {
  /** Restrict which operators can be picked. Defaults to all three. */
  operators?: Operator[]
}

/** Cryptographically-strong random integer in [min, max] (inclusive). */
function randInt(min: number, max: number): number {
  if (min > max) throw new Error('randInt: min > max')
  const range = max - min + 1
  // Web Crypto is available on Node 18+ and all modern browsers/edge runtimes.
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return min + (buf[0]! % range)
}

function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)]!
}

function generateAddition(): Challenge {
  // a + b <= 100
  const a = randInt(1, 90)
  const b = randInt(1, 100 - a)
  return {
    a,
    b,
    operator: '+',
    answer: a + b,
    display: `${a} + ${b}`,
  }
}

function generateSubtraction(): Challenge {
  // ensure a >= b so result is non-negative
  const a = randInt(2, 99)
  const b = randInt(1, a)
  return {
    a,
    b,
    operator: '-',
    answer: a - b,
    display: `${a} - ${b}`,
  }
}

function generateMultiplication(): Challenge {
  // a * b <= 100, both in [2..10]
  const a = randInt(2, 10)
  const maxB = Math.floor(100 / a)
  const b = randInt(2, Math.min(10, maxB))
  return {
    a,
    b,
    operator: '*',
    answer: a * b,
    display: `${a} × ${b}`,
  }
}

export function generateChallenge(options: GeneratorOptions = {}): Challenge {
  const operators = options.operators ?? ['+', '-', '*']
  if (operators.length === 0) {
    throw new Error('generateChallenge: operators array is empty')
  }
  const op = pick(operators)
  switch (op) {
    case '+':
      return generateAddition()
    case '-':
      return generateSubtraction()
    case '*':
      return generateMultiplication()
  }
}
