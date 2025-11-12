export function createMasterControls(state, isMaster) {
	const controlsDiv = document.getElementById("masterControls");
	const playPauseBtn = document.getElementById("playPauseBtn");
	const resetBtn = document.getElementById("resetBtn");

	console.log(
		"Master controls - isMaster:",
		isMaster,
		"controlsDiv:",
		controlsDiv
	);

	// Show controls only if master
	if (isMaster && controlsDiv) {
		controlsDiv.classList.add("show");
		console.log("Master controls visible");
	}

	function updatePlayPauseButton() {
		if (state.isPlaying) {
			playPauseBtn.textContent = "⏸ Pause";
			playPauseBtn.classList.add("playing");
		} else {
			playPauseBtn.textContent = "▶ Play";
			playPauseBtn.classList.remove("playing");
		}
	}

	function onPlayPause(sendToServer, playIndicator) {
		if (state.isPlaying) {
			// Pause - broadcast to all devices
			sendToServer({ type: "pause" });
			state.slides.forEach((slide) => slide.pause());
			state.isPlaying = false;
		} else {
			// Play - broadcast to all devices with synchronized start
			const targetTime = Date.now() + 1000; // 5 seconds from now
			sendToServer({
				type: "play",
				targetTime: targetTime,
				delay: 1000,
			});
			// Local play will be triggered by the WebSocket response
			// Play indicator will be shown by websocketHandlers when play actually starts
		}

		updatePlayPauseButton();
	}

	function onReset(sendToServer) {
		// Stop and reset on all devices
		sendToServer({ type: "stop" });

		const currentSlide = state.slides[state.currentSlideIndex];
		if (currentSlide) {
			currentSlide.reset();
		}

		state.isPlaying = false;
		updatePlayPauseButton();
	}

	function setup(sendToServer, playIndicator) {
		// if (!isMaster) return; // Only setup if master

		playPauseBtn.addEventListener("click", () =>
			onPlayPause(sendToServer, playIndicator)
		);
		resetBtn.addEventListener("click", () => onReset(sendToServer));

		updatePlayPauseButton();
	}

	return { setup, updatePlayPauseButton };
}
