import type { Card } from './cards';
import type { RngState } from './rng';

// Turn flow:
//   'draw'              : current seat must DRAW (skips if deck empty)
//   'action'            : current seat must PLAY or DISCARD
//   'awaiting-response' : the seat in `awaiting` must COUP_FOURRE or PASS
//   'ended'             : hand finished, no actions legal
export type Phase = 'draw' | 'action' | 'awaiting-response' | 'ended';

// A safety in a player's tableau. `coupFourre` marks safeties played as
// Coup-Fourré (interrupt response) so end-of-hand scoring can apply the
// +300 bonus per CF.
export type SafetyEntry = {
  readonly card: Card;
  readonly coupFourre: boolean;
};

// One seat's visible tableau. All piles are bottom-to-top stacks; the top
// of each stack is the last element of the array.
//
// - `battle`  : roll/hazard/remedy stack. Top determines whether the seat
//                can play miles, is blocked by a hazard, etc. Semantics
//                are owned by the core rule plugin.
// - `speed`   : speed-limit/end-of-limit stack. Top determines whether 100
//                and 200 mile cards can be played.
// - `distance`: mile cards accumulated (sum = current km).
// - `safeties`: safeties played, with Coup-Fourré flag.
export type Tableau = {
  readonly battle: ReadonlyArray<Card>;
  readonly speed: ReadonlyArray<Card>;
  readonly distance: ReadonlyArray<Card>;
  readonly safeties: ReadonlyArray<SafetyEntry>;
};

export type Seat = {
  readonly id: number;
  readonly hand: ReadonlyArray<Card>;
  readonly tableau: Tableau;
};

// When the engine pauses to await a Coup-Fourré response, this records
// who is being attacked, who attacked, and which hazard is in question.
// While `awaiting` is set, phase = 'awaiting-response' and only the
// awaiting seat may act (COUP_FOURRE or PASS_COUP_FOURRE).
export type Awaiting = {
  readonly seat: number;
  readonly reason: 'coup-fourre-response';
  readonly hazard: Card;
  readonly attacker: number;
};

export type GameState = {
  readonly phase: Phase;
  readonly seats: ReadonlyArray<Seat>;
  readonly deck: ReadonlyArray<Card>;
  readonly discard: ReadonlyArray<Card>;
  readonly currentSeat: number;
  readonly awaiting: Awaiting | null;
  readonly rng: RngState;
  readonly turnNumber: number;
  readonly handNumber: number;
  readonly target: number;        // km target; 1000 in v1
  readonly winnerSeat: number | null;
};
