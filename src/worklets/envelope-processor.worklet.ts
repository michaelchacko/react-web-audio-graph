import { Mode, Parameters, Stage } from "./envelope-processor.types";

const GATE_OFF = 0;
const GATE_ON = 1;

class EnvelopeProcessor extends AudioWorkletProcessor {
  lastGain: number;
  lastGainAtStageChange: number;
  lastStage: Stage;
  lastTriggerType: number;
  lastTriggerTime: number[];
  sustainOn: boolean;
  mode: Mode;

  constructor(options?: AudioWorkletNodeOptions) {
    super(options);

    this.lastGain = 0;
    this.lastGainAtStageChange = 0;
    this.lastStage = Stage.Attack;
    this.lastTriggerTime = [-Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER];
    this.lastTriggerType = GATE_OFF;
    this.sustainOn = options?.processorOptions.sustainOn ?? true;
    this.mode = options?.processorOptions.mode ?? Mode.Linear;
  }

  static get parameterDescriptors() {
    return [
      {
        name: Parameters.AttackTime,
        defaultValue: 0,
        minValue: 0,
        maxValue: Number.MAX_SAFE_INTEGER,
        automationRate: "k-rate" as AutomationRate,
      },
      {
        name: Parameters.DecayTime,
        defaultValue: 0,
        minValue: 0,
        maxValue: Number.MAX_SAFE_INTEGER,
        automationRate: "k-rate" as AutomationRate,
      },
      {
        name: Parameters.ReleaseTime,
        defaultValue: 0,
        minValue: 0,
        maxValue: Number.MAX_SAFE_INTEGER,
        automationRate: "k-rate" as AutomationRate,
      },
      {
        name: Parameters.SustainLevel,
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
        automationRate: "k-rate" as AutomationRate,
      },
    ];
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>) {
    const input = inputs?.[0]?.[0];
    if (input == null) {
      return true;
    }
    const isGateOn = this.isGateOn(input);

    if (this.lastTriggerType === GATE_OFF && isGateOn) {
      this.lastTriggerType = GATE_ON;
      this.lastTriggerTime[GATE_ON] = currentTime;
    } else if (this.lastTriggerType === GATE_ON && !isGateOn) {
      this.lastTriggerType = GATE_OFF;
      // Do not re-trigger release stage
      if (this.lastStage !== Stage.Release) {
        this.lastTriggerTime[GATE_OFF] = currentTime;
      }
    }

    const stage = this.getStage(input, parameters);
    if (stage !== this.lastStage) {
      this.lastGainAtStageChange = this.lastGain;
      this.lastStage = stage;
    }

    this.lastGain = this.getGain(stage, parameters);

    const output = outputs[0][0];
    const sampleFrames = output.length;
    for (let i = 0; i < sampleFrames; i++) {
      output[i] = this.lastGain;
    }

    return true;
  }

  getGain(stage: Stage, parameters: Record<Parameters, Float32Array>): number {
    const attackTime = parameters.attack[0];
    const decayTime = parameters.decay[0];
    const releaseTime = parameters.release[0];
    const sustainLevel = parameters.sustain[0];
    const timeToValue = this.getTimeToValue();
    const valueToTime = this.getValueToTime();

    // attack always starts at 0
    if (stage === Stage.Attack) {
      if (attackTime <= 0) {
        return 1;
      }

      const startTime = this.lastTriggerTime[GATE_ON];
      const endTime = startTime + attackTime;
      const time = clamp((currentTime - startTime) / (endTime - startTime), 0, 1);

      // 0 -> 1 (peak)
      return timeToValue(time);
    }

    if (stage === Stage.Decay) {
      if (decayTime <= 0) {
        return sustainLevel;
      }

      const startTime = this.lastTriggerTime[GATE_ON] + attackTime;
      const endTime = startTime + decayTime;
      const time = clamp((currentTime - startTime) / (endTime - startTime), 0, 1);

      // 1 (peak) -> sustainLevel
      return 1 - (1 - sustainLevel) * timeToValue(clamp(time, 0, 1));
    }

    if (stage === Stage.Sustain) {
      return sustainLevel;
    }

    if (stage === Stage.Release) {
      if (releaseTime <= 0) {
        return 0;
      }

      if (this.sustainOn) {
        const triggered = this.lastTriggerTime[GATE_OFF] < this.lastTriggerTime[GATE_ON] + attackTime + decayTime;
        const timeFactor = triggered ? valueToTime(this.lastGainAtStageChange) : 1;

        const startTime = this.lastTriggerTime[GATE_OFF];
        const endTime = startTime + releaseTime * timeFactor;
        const time = clamp((currentTime - startTime) / (endTime - startTime), 0, 1);

        const startLevel = triggered ? this.lastGainAtStageChange : sustainLevel;

        // sustainLevel / lastGain -> 0
        return (1 - timeToValue(time)) * startLevel;
      } else {
        const triggered = this.lastTriggerTime[GATE_OFF] > this.lastTriggerTime[GATE_ON];
        const timeFactor = triggered ? valueToTime(this.lastGainAtStageChange) : 1;

        const startTime = triggered
          ? this.lastTriggerTime[GATE_OFF]
          : this.lastTriggerTime[GATE_ON] + attackTime + decayTime;
        const endTime = startTime + releaseTime * timeFactor;
        const time = clamp((currentTime - startTime) / (endTime - startTime), 0, 1);

        const startLevel = triggered ? this.lastGainAtStageChange : sustainLevel;

        // sustainLevel / lastGain -> 0
        return (1 - timeToValue(time)) * startLevel;
      }
    }

    return 0;
  }

  getStage(input: Float32Array, parameters: Record<string, Float32Array>): Stage {
    const isGateOn = this.isGateOn(input);
    const attackTime = parameters.attack[0];
    const decayTime = parameters.decay[0];

    if (this.lastTriggerTime[GATE_OFF] > this.lastTriggerTime[GATE_ON]) {
      return Stage.Release;
    }

    if (currentTime <= this.lastTriggerTime[GATE_ON] + attackTime) {
      return Stage.Attack;
    }

    if (currentTime <= this.lastTriggerTime[GATE_ON] + attackTime + decayTime) {
      return Stage.Decay;
    }

    if (this.sustainOn && isGateOn) {
      return Stage.Sustain;
    }

    return Stage.Release;
  }

  getTimeToValue() {
    switch (this.mode) {
      case Mode.Exponential:
        return exponential;
      case Mode.Linear:
        return linear;
      case Mode.Logarithmic:
        return logarithmic;
    }
  }

  getValueToTime() {
    switch (this.mode) {
      case Mode.Exponential:
        return logarithmic;
      case Mode.Linear:
        return linear;
      case Mode.Logarithmic:
        return exponential;
    }
  }

  isGateOn(input: Float32Array): boolean {
    const length = input.length;

    // Naive lo-fi signal detection that triggers if all of the sample frames are high
    for (let i = 0; i < length; i++) {
      if (input[i] !== GATE_ON) {
        return false;
      }
    }
    return true;
  }
}

registerProcessor("envelope-processor", EnvelopeProcessor);

function clamp(t: number, min: number, max: number) {
  return Math.min(Math.max(t, min), max);
}

function exponential(t: number): number {
  return (Math.pow(10, t) - 1) / 9;
}

function linear(t: number): number {
  return t;
}

function logarithmic(t: number): number {
  return Math.log10(1 + t * 9);
}

// Fixes TypeScript error TS1208:
// File cannot be compiled under '--isolatedModules' because it is considered a global script file.
export {};
