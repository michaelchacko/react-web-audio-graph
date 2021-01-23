import React from "react";
import { NodeProps } from "react-flow-renderer";
import { useNode } from "context/NodeContext";
import Node from "components/Node";
import { Mode, Parameters } from "worklets/envelope-processor.types";

function ADSR({ data, id, selected, type }: NodeProps) {
  const { mode = Mode.Linear, onChange, sustainOn = true } = data;

  // AudioNode
  useNode(
    id,
    context => {
      const envelope = new AudioWorkletNode(context, "envelope-processor", {
        processorOptions: { sustainOn, mode },
      });

      return {
        [Parameters.AttackTime]: envelope.parameters.get(Parameters.AttackTime),
        [Parameters.DecayTime]: envelope.parameters.get(Parameters.DecayTime),
        gain: envelope,
        gate: envelope,
        input: undefined,
        output: undefined,
        [Parameters.ReleaseTime]: envelope.parameters.get(Parameters.ReleaseTime),
        [Parameters.SustainLevel]: envelope.parameters.get(Parameters.SustainLevel),
      };
    },
    [mode, sustainOn]
  );

  return (
    <Node
      id={id}
      inputs={["gate", Parameters.AttackTime, Parameters.DecayTime, Parameters.ReleaseTime, Parameters.SustainLevel]}
      outputs={["gain"]}
      title="ADSR"
      type={type}
    >
      {selected && (
        <div className="customNode_editor nodrag">
          <div className="customNode_item">
            <select onChange={e => onChange({ mode: e.target.value })} title="Type" value={mode}>
              <option value={Mode.Exponential}>{Mode.Exponential}</option>
              <option value={Mode.Linear}>{Mode.Linear}</option>
              <option value={Mode.Logarithmic}>{Mode.Logarithmic}</option>
            </select>
          </div>
          <div className="customNode_item">
            <label>
              <input
                checked={sustainOn}
                onChange={() => onChange({ sustainOn: !sustainOn })}
                title="Sustain"
                type="checkbox"
              />
              sustain on
            </label>
          </div>
        </div>
      )}
    </Node>
  );
}

export default React.memo(ADSR);
