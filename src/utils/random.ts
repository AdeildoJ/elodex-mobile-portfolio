export function randomFromArray<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randomGender(): "M" | "F" | "U" {
  const all: Array<"M" | "F" | "U"> = ["M", "F", "U"];
  return randomFromArray(all);
}
