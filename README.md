# rbxts-animator2D
A lightweight `rbx-ts` image sequence animator for Roblox. It can be used seamlessly alongside **React** or independently.

# Example
```typescript
import React, { useEffect, useState } from "@rbxts/react";
import { useAnimator2D } from "./Animator2DProvider";
import { SpriteFrameData } from "./Animator2D";

const sprite_sheet_id = "rbxassetid://106124767958713";
const image_dimensions = new Vector2(864, 648);

const image_columns = 8;
const image_rows = 6;

const cell_dimensions = new Vector2(image_dimensions.X / image_columns, image_dimensions.Y / image_rows);
const total_cells = image_columns * image_rows;

export function Animator2DExample() {
	const [frameData, setFrameData] = useState<SpriteFrameData>();
	const [isFinished, setIsFinished] = useState(false);
	const animator = useAnimator2D();

	useEffect(() => {
		const id = animator.Bind((data: SpriteFrameData | undefined) => {
			setFrameData(data);
		});

		animator.BindAnimations(id, sprite_sheet_id, cell_dimensions, image_columns);
		animator.Play(id, 24, 1, total_cells, {
			loop: false,
			onEnd: () => {
				setIsFinished(true);
			},
		});
		return () => {
			animator.Terminate(id);
		};
	}, [animator]);

	return (
		<frame Position={UDim2.fromScale(0.5, 0.5)} Size={UDim2.fromScale(0.5, 0.5)} BackgroundTransparency={0.85}>
			<imagelabel
				Image={frameData?.image}
				ImageRectOffset={frameData?.offset}
				ImageRectSize={frameData?.size}
				Size={UDim2.fromScale(1, 1)}
				BackgroundTransparency={1}
			/>
			<frame
				Size={UDim2.fromScale(1, 1)}
				BackgroundColor3={Color3.fromRGB(255, 255, 255)}
				BackgroundTransparency={isFinished ? 0 : 1}
				BorderSizePixel={0}
				ZIndex={2}
			/>
		</frame>
	);
}
