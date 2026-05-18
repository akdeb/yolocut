import React from "react";
import { AbsoluteFill } from "remotion";

export const NoCaptionFile: React.FC<{ missingCount: number }> = ({
  missingCount,
}) => {
  return (
    <AbsoluteFill
      style={{
        height: "auto",
        width: "100%",
        backgroundColor: "white",
        fontSize: 50,
        padding: 30,
        top: undefined,
        fontFamily: "sans-serif",
      }}
    >
      {missingCount} caption {missingCount === 1 ? "file is" : "files are"}{" "}
      missing in the public folder. <br /> Press the caption button in Studio or
      run `node sub.mjs` to create them.
    </AbsoluteFill>
  );
};
