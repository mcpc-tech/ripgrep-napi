#![deny(clippy::all)]

use std::path::PathBuf;

use napi_derive::napi;

use grep::matcher::Matcher;
use grep::regex::RegexMatcherBuilder;
use grep::searcher::{BinaryDetection, SearcherBuilder};
use grep_searcher::sinks::UTF8;
use ignore::WalkBuilder;
use napi::bindgen_prelude::*;
use serde::{Deserialize, Serialize};

/// Configuration options for text search operations
#[derive(Debug, Serialize, Deserialize)]
#[napi(object)]
pub struct SearchOptions {
  /// Enable case-sensitive matching (default: true)
  pub case_sensitive: Option<bool>,
  /// Enable multiline mode for regex patterns
  pub multiline: Option<bool>,
  /// Match whole words only using word boundaries
  pub word_regexp: Option<bool>,
  /// Maximum directory depth to search
  pub max_depth: Option<u32>,
  /// Include hidden files and directories in search
  pub hidden: Option<bool>,
  /// Follow symbolic links during traversal
  pub follow_links: Option<bool>,
  /// Patterns to ignore during search
  pub ignore_patterns: Option<Vec<String>>,
  /// Include line numbers in results (default: true)
  pub line_number: Option<bool>,
  /// Return only file names with matches, not match details
  pub files_with_matches: Option<bool>,
  /// Invert match to show non-matching lines
  pub invert_match: Option<bool>,
  /// Maximum number of matches per file
  pub max_count: Option<u32>,
}

impl Default for SearchOptions {
  fn default() -> Self {
    Self {
      case_sensitive: Some(true),
      multiline: Some(false),
      word_regexp: Some(false),
      max_depth: None,
      hidden: Some(false),
      follow_links: Some(false),
      ignore_patterns: None,
      line_number: Some(true),
      files_with_matches: Some(false),
      invert_match: Some(false),
      max_count: None,
    }
  }
}

/// Represents a single match found during text search
#[derive(Debug, Serialize, Deserialize)]
#[napi(object)]
pub struct SearchMatch {
  /// File path where the match was found
  pub path: String,
  /// Line number (1-based) where the match occurred
  pub line_number: u32,
  /// Complete line content containing the match
  pub line: String,
  /// Start position of the match within the line
  pub start: Option<u32>,
  /// End position of the match within the line
  pub end: Option<u32>,
}

/// Complete search results with statistics and match data
#[derive(Debug, Serialize, Deserialize)]
#[napi(object)]
pub struct SearchResult {
  /// All matches found during the search
  pub matches: Vec<SearchMatch>,
  /// Total number of files searched
  pub files_searched: u32,
  /// Number of files containing matches
  pub files_with_matches: u32,
  /// Total number of individual matches found
  pub total_matches: u32,
  /// Whether the search completed successfully
  pub success: bool,
  /// Error message if search failed
  pub error: Option<String>,
}

/// Search for text patterns in multiple files and directories
///
/// # Arguments
/// * `pattern` - Regular expression pattern to search for
/// * `paths` - List of file paths or directories to search in
/// * `options` - Optional search configuration settings
///
/// # Returns
/// SearchResult containing all matches and search statistics
#[napi]
pub fn search(
  pattern: String,
  paths: Vec<String>,
  options: Option<SearchOptions>,
) -> Result<SearchResult> {
  let opts = options.unwrap_or_default();

  let mut matcher_builder = RegexMatcherBuilder::new();

  if let Some(case_sensitive) = opts.case_sensitive {
    matcher_builder.case_insensitive(!case_sensitive);
  }

  if let Some(multiline) = opts.multiline {
    matcher_builder.multi_line(multiline);
  }

  let final_pattern = if opts.word_regexp == Some(true) {
    format!(r"\b{}\b", pattern)
  } else {
    pattern.clone()
  };

  let matcher = matcher_builder
    .build(&final_pattern)
    .map_err(|e| Error::new(Status::InvalidArg, format!("Invalid regex pattern: {}", e)))?;

  let mut searcher_builder = SearcherBuilder::new();
  searcher_builder.binary_detection(BinaryDetection::convert(b'\x00'));

  if let Some(line_number) = opts.line_number {
    searcher_builder.line_number(line_number);
  }

  if let Some(invert_match) = opts.invert_match {
    searcher_builder.invert_match(invert_match);
  }

  let mut searcher = searcher_builder.build();

  let mut result = SearchResult {
    matches: Vec::new(),
    files_searched: 0,
    files_with_matches: 0,
    total_matches: 0,
    success: true,
    error: None,
  };

  for path in paths {
    let path_buf = PathBuf::from(&path);

    if !path_buf.exists() {
      result.success = false;
      result.error = Some(format!("Path does not exist: {}", path));
      continue;
    }

    let mut walk_builder = WalkBuilder::new(&path_buf);

    if let Some(max_depth) = opts.max_depth {
      walk_builder.max_depth(Some(max_depth as usize));
    }

    if let Some(hidden) = opts.hidden {
      walk_builder.hidden(!hidden);
    }

    if let Some(follow_links) = opts.follow_links {
      walk_builder.follow_links(follow_links);
    }

    let walker = walk_builder.build();

    for entry in walker {
      match entry {
        Ok(entry) => {
          if entry.file_type().map(|ft| ft.is_file()).unwrap_or(false) {
            result.files_searched += 1;

            let file_path = entry.path();
            let mut file_matches = Vec::new();
            let mut match_count = 0u32;

            let search_result = searcher.search_path(
              &matcher,
              file_path,
              UTF8(|lnum, line| {
                if let Some(max_count) = opts.max_count {
                  if match_count >= max_count {
                    return Ok(false);
                  }
                }

                let line_str = line;

                if opts.files_with_matches == Some(true) {
                  file_matches.push(SearchMatch {
                    path: file_path.to_string_lossy().to_string(),
                    line_number: lnum as u32,
                    line: line_str.to_string(),
                    start: None,
                    end: None,
                  });
                  match_count += 1;
                  return Ok(false);
                } else {
                  let mut start_pos = 0;
                  let line_bytes = line.as_bytes();
                  while let Some(mat) = matcher.find_at(line_bytes, start_pos)? {
                    file_matches.push(SearchMatch {
                      path: file_path.to_string_lossy().to_string(),
                      line_number: lnum as u32,
                      line: line_str.to_string(),
                      start: Some(mat.start() as u32),
                      end: Some(mat.end() as u32),
                    });
                    match_count += 1;
                    start_pos = mat.end();

                    if let Some(max_count) = opts.max_count {
                      if match_count >= max_count {
                        return Ok(false);
                      }
                    }
                  }
                }

                Ok(true)
              }),
            );

            if search_result.is_ok() && !file_matches.is_empty() {
              result.files_with_matches += 1;
              result.total_matches += file_matches.len() as u32;
              result.matches.extend(file_matches);
            }
          }
        }
        Err(_) => continue,
      }
    }
  }

  Ok(result)
}

/// Search for text patterns in a single file
///
/// # Arguments
/// * `pattern` - Regular expression pattern to search for
/// * `file_path` - Path to the file to search in
/// * `options` - Optional search configuration settings
///
/// # Returns
/// SearchResult containing all matches found in the file
#[napi]
pub fn search_file(
  pattern: String,
  file_path: String,
  options: Option<SearchOptions>,
) -> Result<SearchResult> {
  search(pattern, vec![file_path], options)
}

/// Validate if a regex pattern is syntactically correct
///
/// # Arguments
/// * `pattern` - Regular expression pattern to validate
///
/// # Returns
/// true if the pattern is valid, false otherwise
#[napi]
pub fn validate_pattern(pattern: String) -> bool {
  RegexMatcherBuilder::new().build(&pattern).is_ok()
}

/// Get a list of commonly supported file extensions
///
/// # Returns
/// Vector of file type names and extensions
#[napi]
pub fn get_supported_file_types() -> Vec<String> {
  vec![
    "rust".to_string(),
    "rs".to_string(),
    "javascript".to_string(),
    "js".to_string(),
    "typescript".to_string(),
    "ts".to_string(),
    "python".to_string(),
    "py".to_string(),
    "go".to_string(),
    "java".to_string(),
    "c".to_string(),
    "cpp".to_string(),
    "html".to_string(),
    "css".to_string(),
    "json".to_string(),
    "xml".to_string(),
    "yaml".to_string(),
    "yml".to_string(),
    "toml".to_string(),
    "markdown".to_string(),
    "md".to_string(),
    "text".to_string(),
    "txt".to_string(),
  ]
}
