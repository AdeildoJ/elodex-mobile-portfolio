import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../theme/colors";

type Props = {
  text: string;
  onConfirm?: () => void;
  waiting?: boolean;
};

export function BattleText({ text, onConfirm, waiting }: Props) {
  const [visible, setVisible] = useState("");

  useEffect(() => {
    let active = true;
    let i = 0;
    setVisible("");
    const t = setInterval(() => {
      if (!active) return;
      i += 1;
      setVisible(text.slice(0, i));
      if (i >= text.length) clearInterval(t);
    }, 20);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [text]);

  const done = useMemo(() => visible.length >= text.length, [visible, text]);

  return (
    <Pressable style={styles.box} onPress={done ? onConfirm : undefined}>
      <Text style={styles.text}>{visible || " "}</Text>
      {done ? <View style={[styles.dot, waiting ? styles.dotWaiting : null]} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    minHeight: 84,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.28)",
    backgroundColor: "rgba(6,10,24,0.97)",
    paddingHorizontal: 14,
    paddingVertical: 11,
    justifyContent: "space-between",
  },
  text: { color: COLORS.white, fontWeight: "800", fontSize: 16, lineHeight: 22 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    alignSelf: "flex-end",
    backgroundColor: "rgba(255,255,255,0.55)",
  },
  dotWaiting: { backgroundColor: "#7dd3fc" },
});
