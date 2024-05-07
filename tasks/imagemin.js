var os = require('os');
var chalk = require('chalk');
var imagemin = require('imagemin');
var plur = require('plur');
var prettyBytes = require('pretty-bytes');
var pMap = require('p-map');

var defaultPlugins = ['gifsicle', 'jpegtran', 'optipng', 'svgo'];

var loadPlugin = (grunt, plugin, opts) => {
	try {
		return require(`imagemin-${plugin}`)(opts);
	} catch (error) {
		grunt.warn(`Couldn't load default plugin "${plugin}"`);
	}
};

var getDefaultPlugins = (grunt, opts) => defaultPlugins.reduce((plugins, plugin) => {
	var instance = loadPlugin(grunt, plugin, opts);

	if (!instance) {
		return plugins;
	}

	return plugins.concat(instance);
}, []);

module.exports = grunt => {
	grunt.registerMultiTask('imagemin', 'Minify PNG, JPEG, GIF and SVG images', function () {
		var done = this.async();
		var options = this.options({
			interlaced: true,
			optimizationLevel: 3,
			progressive: true,
			concurrency: os.cpus().length
		});

		if (Array.isArray(options.svgoPlugins)) {
			options.plugins = options.svgoPlugins;
		}

		var plugins = options.use || getDefaultPlugins(grunt, options);

		var totalBytes = 0;
		var totalSavedBytes = 0;
		var totalFiles = 0;

		var processFile = file => Promise.resolve(grunt.file.read(file.src[0], {encoding: null}))
			.then(buf => Promise.all([imagemin.buffer(buf, {plugins}), buf]))
			.then(res => {
				// TODO: Use destructuring when targeting Node.js 6
				var optimizedBuf = res[0];
				var originalBuf = res[1];
				var originalSize = originalBuf.length;
				var optimizedSize = optimizedBuf.length;
				var saved = originalSize - optimizedSize;
				var percent = originalSize > 0 ? (saved / originalSize) * 100 : 0;
				var savedMsg = `saved ${prettyBytes(saved)} - ${percent.toFixed(1).replace(/\.0$/, '')}%`;
				var msg = saved > 0 ? savedMsg : 'already optimized';

				if (saved > 0) {
					totalBytes += originalSize;
					totalSavedBytes += saved;
					totalFiles++;
				}

				grunt.file.write(file.dest, optimizedBuf);
				grunt.verbose.writeln(chalk.green('✔ ') + file.src[0] + chalk.gray(` (${msg})`));
			})
			.catch(error => {
				grunt.warn(`${error} in file ${file.src[0]}`);
			});

		pMap(this.files, processFile, {concurrency: options.concurrency}).then(() => {
			var percent = totalBytes > 0 ? (totalSavedBytes / totalBytes) * 100 : 0;
			var msg = `Minified ${totalFiles} ${plur('image', totalFiles)}`;

			if (totalFiles > 0) {
				msg += chalk.gray(` (saved ${prettyBytes(totalSavedBytes)} - ${percent.toFixed(1).replace(/\.0$/, '')}%)`);
			}

			grunt.log.writeln(msg);
			done();
		});
	});
};
