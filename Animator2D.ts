import { Controller, OnStart } from "@flamework/core";
import { HttpService, RunService } from "@rbxts/services";
import { Blackboard, FSM } from "@rbxts/state-management";

function GetUniqueID(): string {
	return HttpService.GenerateGUID(false);
}

export interface SpriteFrameData {
	image: string;
	offset: Vector2;
	size: Vector2;
}

export type Animator2D_Callback = (current_image: SpriteFrameData | undefined) => void;
export interface AnimatorBlackboard {
	image_xy: Vector2;
	columns: number;
	sprite_map: string;
}

class animator_idle implements FSM.IFSMState {
	OnEnter(bb: Blackboard<AnimatorBlackboard>): void {
		bb.SetWild<number>("start_frame", -1);
		bb.SetWild<number>("end_frame", -1);
		bb.SetWild<number>("framerate", -1);
	}
	Update(dt_s: number, bb: Blackboard<AnimatorBlackboard>): void {}
	OnExit(bb: Blackboard<AnimatorBlackboard>): void {}
}

class animator_playing implements FSM.IFSMState {
	private frames: Array<SpriteFrameData> = [];
	private startTime = 0;
	private framerate = 24;
	private lastRenderedIndex = -1;

	constructor(
		private readonly identifier: string,
		private readonly onComplete: (identifier: string) => void,
		private readonly callback: Animator2D_Callback,
		private readonly get_frames_from_map: (
			map: string,
			start_frame: number,
			end_frame: number,
			columns: number,
			framesize: Vector2,
		) => Array<SpriteFrameData>,
	) {}

	OnEnter(bb: Blackboard<AnimatorBlackboard>): void {
		bb.SetWild("currentState", "play");
		bb.SetWild("playing_has_completed", false);

		this.startTime = os.clock();
		this.lastRenderedIndex = -1;

		const startFrame = bb.GetWild<number>("start_frame");
		const endFrame = bb.GetWild<number>("end_frame");

		const map = bb.Get("sprite_map");
		const columns = bb.Get("columns");
		const image_xy = bb.Get("image_xy") as Vector2;

		this.framerate = bb.GetWild<number>("framerate") as number;

		if (map !== undefined && startFrame !== undefined && endFrame !== undefined && this.framerate) {
			this.frames = this.get_frames_from_map(map, startFrame, endFrame, columns, image_xy);
		}
	}

	Update(dt_s: number, bb: Blackboard<AnimatorBlackboard>): void {
		if (this.frames.size() === 0) return;

		const totalElapsed = os.clock() - this.startTime;
		const totalFrames = this.frames.size();
		const rawIndex = math.floor(totalElapsed * this.framerate);
		const is_looping = bb.GetWildOrDefault<boolean>("is_looping", false);

		let currentIndex: number;

		if (is_looping) {
			currentIndex = rawIndex % totalFrames;
		} else {
			if (rawIndex >= totalFrames) {
				if (!bb.GetWildOrDefault<boolean>("playing_has_completed", false)) {
					bb.SetWild("playing_has_completed", true);
					this.onComplete(this.identifier);
				}
				currentIndex = totalFrames - 1;
			} else {
				currentIndex = rawIndex;
			}
		}

		if (currentIndex !== this.lastRenderedIndex) {
			this.lastRenderedIndex = currentIndex;
			const currentImg = this.frames[currentIndex];
			this.callback(currentImg);
		}
	}

	OnExit(bb: Blackboard<AnimatorBlackboard>): void {
		this.frames = [];
	}
}

class animator_pause implements FSM.IFSMState {
	OnEnter(bb: Blackboard<AnimatorBlackboard>): void {}
	Update(dt_s: number, bb: Blackboard<AnimatorBlackboard>): void {}
	OnExit(bb: Blackboard<AnimatorBlackboard>): void {}
}

class animator_end implements FSM.IFSMState {
	constructor(private readonly identifier: string, private readonly onFinish: (identifier: string) => void) {}
	OnEnter(bb: Blackboard<AnimatorBlackboard>): void {
		this.onFinish(this.identifier);
	}
	Update(dt_s: number, bb: Blackboard<AnimatorBlackboard>): void {}
	OnExit(bb: Blackboard<AnimatorBlackboard>): void {}
}

@Controller()
export class Animator2D implements OnStart {
	private heartbeatConnection?: RBXScriptConnection;
	private callbacks = new Map<string, Animator2D_Callback>();
	private blackboards = new Map<string, Blackboard<AnimatorBlackboard>>();
	private fsms = new Map<string, FSM.FSM>();

	onStart(): void {
		if (this.heartbeatConnection) return;
		this.heartbeatConnection = RunService.Heartbeat.Connect((dt) => {
			this.fsms.forEach((fsm) => {
				fsm.Update(dt);
			});
		});
	}

	Destroy() {
		this.heartbeatConnection?.Disconnect();
		this.heartbeatConnection = undefined;
		this.fsms.clear();
		this.blackboards.clear();
		this.callbacks.clear();
	}

	Bind(callback: Animator2D_Callback): string {
		const id = GetUniqueID();
		this.callbacks.set(id, callback);
		callback(undefined);
		return id;
	}

	BindAnimations(identifier: string, image: string, imageWidthHeight: Vector2, columns: number) {
		const callback = this.callbacks.get(identifier);
		if (!callback) return;

		const blackboard = new Blackboard<AnimatorBlackboard>({
			image_xy: imageWidthHeight,
			columns: columns,
			sprite_map: image,
		});

		this.blackboards.set(identifier, blackboard);

		const fsm = new FSM.FSM("idle", blackboard);
		fsm.RegisterState("idle", new animator_idle());
		fsm.RegisterState(
			"play",
			new animator_playing(
				identifier,
				(identifier: string) => this.onComplete(identifier),
				callback,
				(m, s, e, c, f) => this.GetFrames(m, s, e, c, f),
			),
		);
		fsm.RegisterState("pause", new animator_pause());
		fsm.RegisterState("end", new animator_end(identifier, (identifier: string) => this.OnEnd(identifier)));

		fsm.AddEventTransition("idle", "play", "play", 1);
		fsm.AddEventTransition("play", "pause", "pause", 1);
		fsm.AddEventTransition("pause", "play", "resume", 1);
		fsm.AddEventTransition("play", "end", "completed", 1);
		fsm.AddEventTransition("end", "idle", "keepAliveOnFinish", 1);

		this.fsms.set(identifier, fsm);
		fsm.Start();
	}

	/**
	 * Can be used to play in reverse
	 */
	Play(
		identifier: string,
		framerate: number,
		startFrame: number,
		endFrame: number,
		keepAliveOnFinish: boolean,
		loopOptions?: {
			loop: boolean;
			end_timer?: number;
		},
	) {
		const fsm = this.fsms.get(identifier);
		if (!fsm) return;

		const blackboard = this.blackboards.get(identifier);
		if (!blackboard) return;

		if (loopOptions) {
			blackboard.SetWild("is_looping", loopOptions.loop ?? false);
			if (loopOptions.end_timer !== undefined) {
				task.delay(loopOptions.end_timer, () => {
					blackboard.SetWild("is_looping", false);
				});
			}
		}

		blackboard.SetWild("alive_on_finish", keepAliveOnFinish);
		blackboard.SetWild("framerate", framerate);
		blackboard.SetWild("start_frame", startFrame);
		blackboard.SetWild("end_frame", endFrame);

		fsm.HandleEvent("play");
	}

	Pause(identifier: string, resumeTimer?: number) {
		const fsm = this.fsms.get(identifier);
		if (!fsm) return;

		fsm.HandleEvent("pause");
		if (resumeTimer !== undefined) {
			task.delay(resumeTimer, () => {
				fsm.HandleEvent("resume");
			});
		}
	}

	Terminate(identifier: string) {
		this.callbacks.delete(identifier);
		this.fsms.delete(identifier);
		this.blackboards.delete(identifier);
	}

	GetState(identifier: string): string | undefined {
		const fsm = this.fsms.get(identifier);
		if (!fsm) return undefined;
		return fsm.GetCurrentState();
	}

	IsPlaying(identifier: string): boolean {
		const fsm = this.fsms.get(identifier);
		if (!fsm) return false;
		return fsm.GetCurrentState() === "play";
	}

	private OnEnd(identifier: string) {
		const fsm = this.fsms.get(identifier);
		if (!fsm) return;

		const blackboard = this.blackboards.get(identifier);
		if (!blackboard) return;

		const keepAlive = blackboard.GetWildOrDefault<boolean>("alive_on_finish", false);
		if (keepAlive) {
			fsm.HandleEvent("keepAliveOnFinish");
		} else {
			this.Terminate(identifier);
		}
	}

	private onComplete(identifier: string) {
		const fsm = this.fsms.get(identifier);
		if (!fsm) return;
		fsm.HandleEvent("completed");
	}

	private GetFrames(
		map: string,
		startFrame: number,
		endFrame: number,
		columns: number,
		framesize: Vector2,
	): Array<SpriteFrameData> {
		const frame_data_array = new Array<SpriteFrameData>();

		const isBackward = startFrame > endFrame;
		const step = isBackward ? -1 : 1;

		for (let i = startFrame; isBackward ? i >= endFrame : i <= endFrame; i += step) {
			const index = i - 1;
			const col = index % columns;
			const row = math.floor(index / columns);

			frame_data_array.push({
				image: map,
				offset: new Vector2(col * framesize.X, row * framesize.Y),
				size: framesize,
			});
		}

		return frame_data_array;
	}
}
