/*
 * GetSmartJS Node.js express.js module
 * compresses and minifies javascript using github.com/mishoo/UglifyJS
 * leaves '.min.js' files alone
 * concats all files in a folder (recursively) if a request is made and the file doesn't exist
 * eg. reqest 'app.js' concats all files in the folder 'app'
 */


var jsp = require('uglify-js').parser,
pro = require('uglify-js').uglify,
_ = require('underscore'),
fs = require('fs'),
coffeescript = require('coffee-script'),
isProduction = process.env.NODE_ENV == 'production',
defaults = {
	isProduction: isProduction,
	compress: isProduction
},
cache = {};


module.exports = function GetSmartJS(options) {
	// setup
	options = _.extend(defaults, options || {});
	
  // Source dir required
  if ( ! options.src ) throw new Error('GetSmartJS requires "src" directory');

	
	// the middleware
	return function(req, res, next) {
		
		// vars
		var reqUrl = req.originalUrl.split('?')[0],
		stats, filePath, fileList, i, file,
		data = '',
		isPathFile = false,
		pathFileChanged = false,
		requestMethod = req.originalMethod || req.method;
		
		// if not a GET request or the url doesn't end in .js
		if (requestMethod != 'GET' || reqUrl.substr(-3) != '.js'){
			// no .js, move to next middleware
			next();
			return;
		}
		
		// for production, check the cache to see if we've already processed this file
		if (options.isProduction && cache[reqUrl]) {
			// serve cached version
			serveCached(res, reqUrl)
			return;
		}
		
		// does the file exist in the source path?
		if (stats = fileExists(options.src + reqUrl)){

			// if source file hasn't changed
			if (cache[reqUrl] && stats.mtime.toString() == cache[reqUrl].mtime){
				// serve cached version
				serveCached(res, reqUrl)
				return
			}

			// otherwise update mod time
			cache[reqUrl] = cache[reqUrl] || {}
			cache[reqUrl].mtime = stats.mtime.toString()
		}
		// does a .coffee file exist
		else if(stats = fileExists(options.src + reqUrl.replace(/\.js$/, '.coffee'))){

			// if source file hasn't changed
			if (cache[reqUrl] && stats.mtime.toString() == cache[reqUrl].mtime){
				// serve cached version
				serveCached(res, reqUrl)
				return
			}

			// otherwise update mod time
			cache[reqUrl] = cache[reqUrl] || {}
			cache[reqUrl].mtime = stats.mtime.toString()
			cache[reqUrl].coffee = true
		}
		else { // no file exists, try folders
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
				fileList = _.sortBy(getFileList(filePath), function(name){return name});
				
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
				
				// concat
				if (file.substr(-3) == '.js'){
					data += fs.readFileSync(file, 'utf8') + ';\n\n';
				}
				if (file.substr(-7) == '.coffee'){
					data += coffeescript.compile(fs.readFileSync(file, 'utf8')  + ';\n\n')
				}
			}
			
			// register the cache for the request url
			cache[reqUrl] = true
		}
		else {
			if (cache[reqUrl].coffee){
				data = fs.readFileSync(options.src + reqUrl.replace(/\.js$/, '.coffee'), 'utf8');
			}
			else {
				data = fs.readFileSync(options.src + reqUrl, 'utf8');
			}
		}
		
		if (cache[reqUrl].coffee){
			data = coffeescript.compile(data)
		}

		// compress the file if not already minified
		if (options.compress && reqUrl.substr(reqUrl.length - 6) != 'min.js') {
			data = jsp.parse(data); // parse code and get the initial AST
			data = pro.ast_mangle(data); // get a new AST with mangled names
			data = pro.ast_squeeze(data); // get an AST with compression optimizations
			data = pro.gen_code(data);
		}

		cache[reqUrl].data = data
	
		// send the file to browser (don't wait for write to finish)
		res.writeHead(200, {'Content-Type': 'application/javascript'});
		res.end(data);
	}
};







/*
 * Private functions
 */



/*
 * get a list of all files in the directory
 */
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



/*
 * Make a directory, recursively
 */
function makeDirectory(path, root){
	// default for root
	if ( ! root) root = '';
	
	// remove the trailing slash (/) from path
	if (path.substr(path.length - 1) == '/') path = path.substr(0, path.length - 1);
	
	var stats,
	// split the path into its parts
	branches = path.split('/');
	
	// add the first part of the path
	root += branches.shift() + '/';
	
	// check if path root exists
	try {
		stats = fs.statSync(root);
	}
	catch (error) {
		// directory doesn't exist, yet
		try {
			fs.mkdirSync(root, '755');
		}
		catch (error) {
			console.log('GetSmartJS: Couldn\'t create directory:', root);
		}
	}
	
	// next branch (recursive)
	if (branches.length) makeDirectory(branches.join('/'), root);
};


/*
	Serve the cached version from memory
*/
function serveCached(res, url){
	res.writeHead(200, {'Content-Type': 'application/javascript'})
	res.end(cache[url].data)
}

/*
	Checks if a file exists at a given path
*/
function fileExists(path){
	try	{
		var stats = fs.statSync(path)
		return stats
	}
	catch(error) {
		return false
	}

}
