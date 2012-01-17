/*
 * GetSmartJS Node.js express.js module
 * compresses and minifies javascript using github.com/mishoo/UglifyJS
 * leaves '.min.js' files alone
 * concats all files in a folder (recursively) if a request is made and the file doesn't exist
 * eg. reqest 'app.js' concats all files in the folder 'app'
 */


var jsp = require('uglify-js').parser,
pro = require('uglify-js').uglify,
fs = require('fs'),
isProduction = process.env.NODE_ENV == 'production',
defaults = {
	isProduction: isProduction,
	compress: isProduction
},
cache = {};


module.exports = function GetSmartJS(options) {
	// setup
	
  options = options || {};
	
	// apply the defaults
	for (var name in defaults){
		if ( ! options[name]) options[name] = defaults[name]; 
	};
	
  // Source and destination dir required
  if ( ! options.src || ! options.dest) throw new Error('GetSmartJS requires "src" and "dest" directory');

	
	
	// the middleware
	return function(req, res, next) {
		
		// vars
		var reqUrl = req.originalUrl.split('?')[0],
		stats, filePath, fileList, i, file,
		data = '',
		isPathFile = false,
		pathFileChanged = false;
		
		// if the url doesn't end in .js
		if (req.originalMethod != 'GET' || reqUrl.substr(-3) != '.js'){
			// no .js, move to next middleware
			next();
			return;
		}
		
		// for production, check the cache to see if we've already processed this file
		if (options.isProduction && cache[reqUrl]) {
			// use the public version
			next();
			return;
		}
		
		// does the file exist in the source path?
		try	{
			stats = fs.statSync(options.src + reqUrl);
			
			// if source file hasn't changed since last request
			if (cache[reqUrl] && stats.mtime.toString() == cache[reqUrl]) {
				// serve the public file
				next();
				return;
			}
			
			// update the cache
			cache[reqUrl] = stats.mtime.toString();
		}
		catch (error) {
			// the source file doesn't exist, check if a folder exists
			try {
				filePath = options.src + reqUrl.substring(0, reqUrl.length - 3); // cut off the '.js'
				stats = fs.statSync(filePath);
				isPathFile = stats.isDirectory();
			
				if ( ! isPathFile) {
					// try the public file
					console.log('GetSmartJS: file doesn\'t exist', reqUrl)
					next();
					return;
				}
				
				// get the list of files
				fileList = getFileList(filePath);
				
				// check if any file has changed
				for (i = fileList.length - 1; i >= 0; i--) {
					file = fileList[i];
					
					if (cache[file]) {
						stats = fs.statSync(file);

						if (stats.mtime.toString() != cache[file]) {
							pathFileChanged = true;
							break;
						}
					}
					else {
						pathFileChanged = true;
						break;
					}
				}

				// if no files have changed
				if ( ! pathFileChanged) {
					// serve the public file
					next();
					return;
				}
			}
			catch (error) {
				// the folder doesn't exist, try the public file
				console.log('GetSmartJS: file or directory doesn\'t exist', filePath)
				next();
				return;
			}
		}
		
		
		// now we read the files
		if (isPathFile) {
			for (i = 0; i < fileList.length; i++) {
				file = fileList[i];
				
				// update the cache stamp
				stats = fs.statSync(file);
				cache[file] = stats.mtime.toString();
			
				// concat
				data += fs.readFileSync(file, 'utf8') + '\n\n';
			}
			
			// register the cache for the request url
			cache[reqUrl] = true;
		}
		else {
			data = fs.readFileSync(options.src + reqUrl, 'utf8');
		}
		
		// compress the file if not already minified
		if (options.compress && reqUrl.substr(reqUrl.length - 6) != 'min.js') {
			data = jsp.parse(data); // parse code and get the initial AST
			data = pro.ast_mangle(data); // get a new AST with mangled names
			data = pro.ast_squeeze(data); // get an AST with compression optimizations
			data = pro.gen_code(data);
		}
		
		// get the directory part of the string
		var directory = options.dest + reqUrl.substring(0, reqUrl.lastIndexOf('/') + 1);
		
		// check destination folder exists
		try {
			stats = fs.statSync(directory);
		}
		catch (error) {
			// directory doesn't exist, yet
			fs.mkdirSync(directory, '755');
		}
		
		// save to destination folder
		fs.writeFileSync(options.dest + reqUrl, data, 'utf8', function(error) {
			if (error) {
				console.log('GetSmartJS: write error', reqUrl, error);
				res.send(404);
				return;
			};
		});
	
		// send the file to browser (don't wait for write to finish)
		res.writeHead(200, {'Content-Type': 'application/javascript'});
		res.end(data);
	}
};







/*
 * Private functions
 */


// get a list of all files in the directory
function getFileList(path) {
	var paths = fs.readdirSync(path),
	files = [],
	stats, item, i;

	// sort files from directories
	for (i = paths.length - 1; i >= 0; i--) {
		item = paths[i];
		
		// @todo add to blacklist
		if (item.charAt(0) == '.') break;
	
		item = path + '/' + item;
	
		try {
			stats = fs.statSync(item);
		
			// files
			if ( ! stats.isDirectory() ) files.push(item);
		
			// directories – recursive function
			else files = files.concat(getFileList(item) );
		}
		catch (error) {
			console.log('GetSmartJS: Couldn\'t find path:', item);
		}
	}
	
	return files;
}

