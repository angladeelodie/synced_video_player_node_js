const express = require("express");
const { WebSocketServer } = require("ws");
const { createServer } = require("http");
const { join } = require("path");
const timesyncServer = require("timesync/server");
const cors = require("cors");
const {
	scanMediaDirectories,
	getProjectNames,
	getProject,
	getAllThumbnails,
	getMediaSummary,
} = require("./js/server/mediaScanner");

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

let currentSource = "0"; // Will be updated after scanning media
const mediaPath = join(__dirname, "videos");

// Scan media directories on startup
let mediaCatalog = {};
try {
	mediaCatalog = scanMediaDirectories(mediaPath);
	const summary = getMediaSummary(mediaCatalog);
	console.log("Media catalog loaded:");
	console.log(`Found ${summary.projectCount} project(s)`);
	summary.projects.forEach((proj) => {
		console.log(
			`  - ${proj.name}: poster(${proj.counts.poster}), phone(${
				proj.counts.phone
			}), music(${proj.counts.music}), billboard(${
				proj.counts.billboard
			}), album(${proj.counts.album}), thumb(${proj.hasThumb ? "yes" : "no"})`
		);
	});

	// Set default source to first project's first available media type
	if (summary.projects.length > 0) {
		const firstProject = summary.projects[0];
		let mediaType = null;

		// Prioritize media types: poster > phone > billboard > album
		if (firstProject.hasPoster) mediaType = "poster";
		else if (firstProject.hasPhone) mediaType = "phone";
		else if (firstProject.hasBillboard) mediaType = "billboard";
		else if (firstProject.hasAlbum) mediaType = "album/1"; // Default to album subfolder 1

		if (mediaType) {
			currentSource = `${firstProject.name}/${mediaType}`;
			console.log(`Default source set to: ${currentSource}`);
		}
	}
} catch (error) {
	console.error("Error scanning media directories:", error);
}

const PORT = process.env.PORT || 3000;

// Store all connected clients with metadata
const clients = new Map(); // Map of ws -> client metadata
let clientIdCounter = 0;

// Enable CORS for all routes (required for iOS Safari and cross-origin requests)
app.use(cors());

// Serve static files (HTML, CSS, JS)
app.use(express.static(__dirname));

// Serve node_modules for client-side dependencies
app.use("/node_modules", express.static(join(__dirname, "node_modules")));

// Serve index.html for root route
app.get("/", (req, res) => {
	res.sendFile(join(__dirname, "index.html"));
});

// Serve album-player.html
app.get("/album-player", (req, res) => {
	res.sendFile(join(__dirname, "album-player.html"));
});

app.use("/timesync", timesyncServer.requestHandler);

// Serve all media files: /media/{project}/{type}/{file(s)}
app.use("/media", express.static(join(__dirname, "videos")));

// API: Get full media catalog
app.get("/api/media", (req, res) => {
	res.json({
		catalog: mediaCatalog,
		summary: getMediaSummary(mediaCatalog),
	});
});

// API: Get list of all projects
app.get("/api/media/projects", (req, res) => {
	const projects = getProjectNames(mediaCatalog);
	res.json({ projects, count: projects.length });
});

// API: Get specific project data
app.get("/api/media/projects/:projectName", (req, res) => {
	const { projectName } = req.params;
	const project = getProject(mediaCatalog, projectName);

	if (!project) {
		return res.status(404).json({ error: "Project not found" });
	}

	res.json({ projectName, ...project });
});

// API: Get all thumbnails
app.get("/api/media/thumbnails", (req, res) => {
	const thumbnails = getAllThumbnails(mediaCatalog);
	res.json({ thumbnails, count: thumbnails.length });
});

// API: Get specific media type from project
// Supports: /api/media/projects/:projectName/:mediaType
// Also supports album subfolders: /api/media/projects/:projectName/album/:subfolder
app.get(
	"/api/media/projects/:projectName/:mediaType/:subfolder?",
	(req, res) => {
		const { projectName, mediaType, subfolder } = req.params;
		const project = getProject(mediaCatalog, projectName);

		if (!project) {
			return res.status(404).json({ error: "Project not found" });
		}

		const validTypes = [
			"poster",
			"phone",
			"music",
			"billboard",
			"album",
			"thumb",
		];
		if (!validTypes.includes(mediaType)) {
			return res.status(400).json({
				error: `Invalid media type. Must be one of: ${validTypes.join(", ")}`,
			});
		}

		let mediaData = project[mediaType];

		// Handle album subfolders
		if (mediaType === "album" && subfolder) {
			if (!mediaData || !mediaData[subfolder]) {
				return res
					.status(404)
					.json({ error: `Album subfolder '${subfolder}' not found` });
			}
			mediaData = mediaData[subfolder];
		}

		if (!mediaData || (Array.isArray(mediaData) && mediaData.length === 0)) {
			return res
				.status(404)
				.json({ error: `No ${mediaType} found for this project` });
		}

		res.json({ projectName, mediaType, data: mediaData });
	}
);

// Broadcast message to all connected clients
function broadcast(message, excludeCommanders = false) {
	const data = JSON.stringify(message);
	clients.forEach((metadata, client) => {
		if (client.readyState === 1) {
			// WebSocket.OPEN = 1
			// Skip commander clients if excludeCommanders is true
			if (excludeCommanders && metadata.isCommander) {
				return;
			}
			client.send(data);
		}
	});
}

// Get list of all connected clients
function getClientsList() {
	const clientsList = [];
	clients.forEach((metadata, ws) => {
		if (ws.readyState === 1) {
			clientsList.push({
				id: metadata.id,
				connectedAt: metadata.connectedAt,
				isCommander: metadata.isCommander,
			});
		}
	});
	return clientsList;
}

// Broadcast client list update to all commander clients
function broadcastClientListUpdate() {
	const clientsList = getClientsList();
	const message = JSON.stringify({
		type: "clientsUpdate",
		clients: clientsList,
		total: clientsList.length,
	});

	clients.forEach((metadata, client) => {
		if (client.readyState === 1 && metadata.isCommander) {
			client.send(message);
		}
	});
}

// WebSocket connection handling
wss.on("connection", (ws, req) => {
	console.log("New WebSocket connection established");

	// Create client metadata
	const clientId = ++clientIdCounter;
	const clientMetadata = {
		id: clientId,
		connectedAt: new Date().toISOString(),
		isCommander: false, // Will be set to true if client identifies as commander
	};

	// Add client to map
	clients.set(ws, clientMetadata);

	// Send welcome message to client
	ws.send(
		JSON.stringify({
			type: "welcome",
			message: "Connected to server",
			clientId: clientId,
		})
	);
	ws.send(JSON.stringify({ type: "source", source: currentSource }));

	// Broadcast updated client list to commanders
	broadcastClientListUpdate();

	// Handle messages from client
	ws.on("message", (message) => {
		try {
			const data = JSON.parse(message);
			console.log("Received:", data);

			switch (data.type) {
				case "identify":
					// Client identifies itself as commander or regular client
					if (data.role === "commander") {
						clientMetadata.isCommander = true;
						// Send initial client list to new commander
						ws.send(
							JSON.stringify({
								type: "clientsUpdate",
								clients: getClientsList(),
								total: getClientsList().length,
							})
						);
					}
					break;
				case "getClients":
					// Request for client list
					ws.send(
						JSON.stringify({
							type: "clientsUpdate",
							clients: getClientsList(),
							total: getClientsList().length,
						})
					);
					break;
				case "play":
					// Use targetTime from client if provided, otherwise calculate
					const targetTime = data.targetTime || Date.now() + 1000;

					// Broadcast play command to all clients with target time (excluding commanders)
					broadcast(
						{
							type: "play",
							video: data.video || "video-vertical",
							targetTime: targetTime,
							delay: data.delay || 1000,
						},
						true
					);
					console.log(
						`Broadcasting play command at ${new Date(targetTime).toISOString()}`
					);
					break;
				case "pause":
					broadcast({ type: "pause" }, true);
					break;
				case "reload":
					broadcast({ type: "reload" }, true);
					break;
				case "stop":
					broadcast({ type: "stop" }, true);
					break;
				case "setSource":
					// Update current source and broadcast to all clients
					if (data.source) {
						currentSource = data.source;
						console.log(`Source changed to: ${currentSource}`);
						broadcast({ type: "source", source: currentSource }, true);
					}
					break;
				default:
					// Echo message back to sender only
					ws.send(JSON.stringify({ type: "echo", data: data }));
			}
		} catch (error) {
			console.error("Error parsing message:", error);
			ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
		}
	});

	// Handle connection close
	ws.on("close", () => {
		console.log("WebSocket connection closed");
		clients.delete(ws);
		// Broadcast updated client list to commanders
		broadcastClientListUpdate();
	});

	// Handle errors
	ws.on("error", (error) => {
		console.error("WebSocket error:", error);
		clients.delete(ws);
		// Broadcast updated client list to commanders
		broadcastClientListUpdate();
	});
});

// Start server
server.listen(PORT, () => {
	console.log(`Server running on http://localhost:${PORT}`);
	console.log(`WebSocket server ready for connections`);
});
