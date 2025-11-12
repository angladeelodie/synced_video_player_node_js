const fs = require("fs");
const { join } = require("path");

/**
 * Scans a directory for PNG sequence files
 * @param {string} dirPath - Path to directory
 * @returns {Object[]} Array of file objects
 */
function scanPngSequence(dirPath, urlPrefix) {
  if (!fs.existsSync(dirPath)) return [];

  const files = fs
    .readdirSync(dirPath)
    .filter((file) => file.endsWith(".png"))
    .sort(); // Sort to ensure correct order

  return files.map((file) => ({
    fileName: file,
    url: `${urlPrefix}/${file}`,
    path: join(dirPath, file),
  }));
}

/**
 * Scans a directory for media files (PNG or MP4)
 * @param {string} dirPath - Path to directory
 * @param {string} urlPrefix - URL prefix for files
 * @returns {Object[]} Array of file objects
 */
function scanMediaFiles(dirPath, urlPrefix) {
  if (!fs.existsSync(dirPath)) return [];

  const files = fs
    .readdirSync(dirPath)
    .filter((file) => file.endsWith(".png") || file.endsWith(".mp4"))
    .sort(); // Sort to ensure correct order

  return files.map((file) => ({
    fileName: file,
    url: `${urlPrefix}/${file}`,
    path: join(dirPath, file),
  }));
}

function scanAlbum(albumPath, urlPrefix) {
  if (!fs.existsSync(albumPath)) return null;

  const album = {};
  const subfolders = fs
    .readdirSync(albumPath, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name)
    .sort((a, b) => parseInt(a) - parseInt(b)); // Sort numerically

  subfolders.forEach((folderName) => {
    const folderPath = join(albumPath, folderName);
    album[folderName] = scanMediaFiles(
      folderPath,
      `${urlPrefix}/${folderName}`
    );
  });

  return album;
}
function scanMusic(musicPath, urlPrefix) {
  if (!fs.existsSync(musicPath)) return [];

  const files = fs
    .readdirSync(musicPath)
    .filter((file) => file.endsWith(".mp3"))
    .sort();

  return files.map((file) => ({
    fileName: file,
    url: `${urlPrefix}/${file}`,
    path: join(musicPath, file),
  }));
}

function scanMediaDirectories(basePath) {
  const catalog = {};

  if (!fs.existsSync(basePath)) {
    console.warn(`Media directory not found: ${basePath}`);
    return catalog;
  }

  const projectFolders = fs
    .readdirSync(basePath, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name)
    .filter((name) => name !== "mp4" && name !== "png_sequence"); // Skip old structure folders

  projectFolders.forEach((projectName) => {
    const projectPath = join(basePath, projectName);
    const urlBase = `/media/${projectName}`;

    catalog[projectName] = {
      name: projectName,
      poster: scanMediaFiles(join(projectPath, "poster"), `${urlBase}/poster`),
      phone: scanMediaFiles(join(projectPath, "phone"), `${urlBase}/phone`),
      music: scanMusic(join(projectPath, "music"), `${urlBase}/music`),
      billboard: scanMediaFiles(
        join(projectPath, "billboard"),
        `${urlBase}/billboard`
      ),
      album: scanAlbum(join(projectPath, "album"), `${urlBase}/album`),
      thumb: null,
    };

    // Check for thumbnail
    const thumbPath = join(projectPath, "thumb.png");
    if (fs.existsSync(thumbPath)) {
      catalog[projectName].thumb = {
        fileName: "thumb.png",
        url: `${urlBase}/thumb.png`,
        path: thumbPath,
      };
    }
  });

  return catalog;
}

function getProjectNames(catalog) {
  console.log("Getting project names:");
  console.log(Object.keys(catalog));
  return Object.keys(catalog);
}

function getProject(catalog, projectName) {
  return catalog[projectName] || null;
}

function getAllThumbnails(catalog) {
  const thumbnails = [];

  Object.entries(catalog).forEach(([projectName, project]) => {
    if (project.thumb) {
      thumbnails.push({
        projectName,
        ...project.thumb,
      });
    }
  });

  return thumbnails;
}

function getMediaSummary(catalog) {
  const summary = {
    projectCount: Object.keys(catalog).length,
    projects: [],
  };

  Object.entries(catalog).forEach(([projectName, project]) => {
    const projectSummary = {
      name: projectName,
      hasPoster: project.poster.length > 0,
      hasPhone: project.phone.length > 0,
      hasMusic: project.music.length > 0,
      hasBillboard: project.billboard.length > 0,
      hasAlbum: project.album && Object.keys(project.album).length > 0,
      hasThumb: project.thumb !== null,
      counts: {
        poster: project.poster.length,
        phone: project.phone.length,
        music: project.music.length,
        billboard: project.billboard.length,
        album: project.album ? Object.keys(project.album).length : 0,
      },
    };

    summary.projects.push(projectSummary);
  });

  return summary;
}

module.exports = {
  scanMediaDirectories,
  getProjectNames,
  getProject,
  getAllThumbnails,
  getMediaSummary,
};
