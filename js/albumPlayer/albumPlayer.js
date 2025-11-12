import Swiper from "swiper";
import { api } from "../api/api.js";
import { messageManager } from "../components/messageManager.js";
import { getParamsFromUrl } from "../utils.js";
import { loadAlbumsPhonesDatas } from "./loadAlbumsPhonesDatas.js";
import { createWebSocketHandlers } from "./websocketHandlers.js";
import { createMasterControls } from "./masterControls.js";
import { createPlayIndicator } from "./playIndicator.js";

async function main() {
  const { isMaster } = getParamsFromUrl(window.location.href);

  // State
  const state = {
    slides: [],
    albumData: [],
    currentSlideIndex: 0,
    numSlides: 0,
    isPlaying: false,
  };

  // Create WebSocket + Play indicator (if you need them)
  const playIndicator = createPlayIndicator();
  const MESSAGE_MANAGER = messageManager();
  let masterControls = null;
  let API = null;

  try {
    // Load the album/phone data
    const urlParams = getParamsFromUrl(window.location.href);
    const mediaTypes = urlParams.media || "album"; // e.g. ?media=album,phone
    state.albumData = await loadAlbumsPhonesDatas(mediaTypes);
    state.numSlides = state.albumData.length;

    // Build the Swiper DOM slides
    const swiperWrapper = document.querySelector(".swiper-wrapper");
    swiperWrapper.innerHTML = ""; // clear

    state.albumData.forEach((item, i) => {
      console.log(item);
      const slide = document.createElement("div");
      slide.classList.add("swiper-slide");

      // Example — depends on your item structure
      // Assuming item has .title, .thumbnail, .videoUrl, etc.
      slide.innerHTML = `
        <div class="slide-content">
        <video width="320" height="320" loop muted playsinline autoplay>
		  <source src="${item.video_url}" type="video/mp4">
		  Your browser does not support the video tag.
		</video>
        </div>
      `;
      swiperWrapper.appendChild(slide);
    });

    let swiper;

    // Setup optional master controls / WS communication
    const websocketHandlers = createWebSocketHandlers(
      state,
      (index) => swiper.slideToLoop(index), // Move Swiper instead of 3D carousel
      () => API,
      MESSAGE_MANAGER,
      () => masterControls?.updatePlayPauseButton(),
      null,
      playIndicator
    );

    // Initialize Swiper
    swiper = new Swiper(".swiper", {
      effect: "coverflow",
      loop: true,
      slidesPerView: 3,
      coverflowEffect: {
        rotate: 30,
        stretch: 100,
        depth: 10,
        modifier: 1,
        slideShadows: true,
      },
      pagination: {
        el: ".swiper-pagination",
        clickable: true,
      },
      navigation: {
        nextEl: ".swiper-button-next",
        prevEl: ".swiper-button-prev",
      },
      on: {
        slideChange() {
          state.currentSlideIndex = this.realIndex;
          playIndicator.update();
          // Optionally send over WebSocket
          API?.sendSlideChange?.(state.currentSlideIndex);
        },
      },
    });

    API = api(websocketHandlers.createMessageHandler(), isMaster);
    masterControls = createMasterControls(state, isMaster);
    masterControls.setup(() => API, playIndicator);
  } catch (error) {
    console.error("Initialization failed:", error);
    alert(`Failed to load album videos: ${error.message}`);
  }
}

window.addEventListener("DOMContentLoaded", main);
