#!/bin/bash


# Fix ES module imports by adding .js extensions to relative import paths

fix_imports_in_file() {
  local file=$1
  
  # Use a more robust approach with proper escaping
  # For macOS sed, need to use '' for in-place editing
  sed -i.bak \
    -e "s|from ['\\\"]\\(\\./[^'\\\"]*\\)['\\\"]|from '\1.js'|g" \
    -e "s|from ['\\\"]\\(\\.\\./[^'\\\"]*\\)['\\\"]|from '\1.js'|g" \
    "$file"
  
  # Remove the backup file
  rm -f "${file}.bak"
}

# Fix all dist folders
echo "Fixing ESM imports in dist folders..."

for dir in "/Users/steven/_CODE/GIT/multi-agent-ide/packages/daemon/dist" \
           "/Users/steven/_CODE/GIT/multi-agent-ide/packages/main/dist" \
           "/Users/steven/_CODE/GIT/multi-agent-ide/packages/shared/dist" \
           "/Users/steven/_CODE/GIT/multi-agent-ide/packages/ui/dist"; do
  
  if [ -d "$dir" ]; then
    find "$dir" -type f -name "*.js" | while read file; do
      fix_imports_in_file "$file"
    done
    echo "✓ Fixed imports in $dir"
  fi
done

echo "✅ ESM import fixes complete"
