import React, { useMemo, useRef } from "react";
import { NodeContext, NodeContextType } from "context/NodeContext";

interface Props {
  children: React.ReactNode;
}

function Nodes({ children }: Props) {
  const nodes = useRef<NodeContextType["nodes"]>({});
  const context: NodeContextType = useMemo(
    () => ({
      addNode: (id, node) => {
        nodes.current[id] = node;
      },
      nodes: nodes.current,
    }),
    []
  );

  return (
    <div>
      <NodeContext.Provider value={context}>{children}</NodeContext.Provider>
    </div>
  );
}

export default Nodes;