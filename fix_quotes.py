import os
import glob

files = glob.glob('src/pages/**/*.tsx', recursive=True)
count = 0

for file_path in files:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    if r'\"' in content:
        content = content.replace(r'\"', '"')
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'Fixed {file_path}')
        count += 1

print(f'Fixed {count} files.')
