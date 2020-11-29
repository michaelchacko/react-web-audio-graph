import { forwardRef, useContext, useEffect, useImperativeHandle, useMemo } from "react";
import { AudioContext } from "context/AudioContext";

interface Props {
  gain: number;
  id: string;
}

type Ref = GainNode;

const Gain = forwardRef<Ref, Props>(function ({ gain }, ref) {
  const context = useContext(AudioContext);
  const node = useMemo<GainNode>(
    () => context.createGain(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [context]
  );

  useEffect(
    () => {
      node.gain.value = gain;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gain]
  );

  useImperativeHandle(ref, () => node);

  return null;
});
Gain.displayName = "Gain";

export default Gain;
