import React, { useMemo, useEffect } from "@rbxts/react";
import ReactRoblox from "@rbxts/react-roblox";

import { Animator2DExample } from "./Animator2DExample";
import { Animator2D } from "./Animator2D";
import { Animator2DProvider } from "./Animator2DProvider";

function StoryRoot() {
	const animator2D = useMemo(() => {
		const anim = new Animator2D();
		anim.onStart();
		return anim;
	}, []);

	useEffect(() => {
		return () => {
			animator2D.Destroy();
		};
	}, [animator2D]);

	return (
		<Animator2DProvider animator2D={animator2D}>
			<Animator2DExample />
		</Animator2DProvider>
	);
}

const story = {
	react: React,
	reactRoblox: ReactRoblox,
	story: (props: { target: Frame }) => {
		const root = ReactRoblox.createRoot(props.target);
		root.render(<StoryRoot />);
		return () => {
			root.unmount();
		};
	},
};

export = story;
