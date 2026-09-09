import React, { createContext, useContext } from "@rbxts/react";
import { Animator2D } from "./Animator2D";

const AnimatorContext = createContext<Animator2D | undefined>(undefined);
export function Animator2DProvider({ animator2D, children }: { animator2D: Animator2D; children: React.ReactNode }) {
	return <AnimatorContext.Provider value={animator2D}>{children}</AnimatorContext.Provider>;
}

export function useAnimator2D() {
	const animator = useContext(AnimatorContext);
	if (!animator) {
		error("useAnimator must be used within an AnimatorProvider!");
	}
	return animator;
}
