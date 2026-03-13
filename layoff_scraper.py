import urllib.request
import xml.etree.ElementTree as ET
import json
import os
import time
from datetime import datetime
import google.generativeai as genai

API_KEY = os.environ.get("GEMINI_API_KEY")
if not API_KEY:
    print("API Key not found. Exiting.")
    exit(1)

genai.configure(api_key=API_KEY)
model = genai.GenerativeModel('gemini-2.5-flash')

JSON_FILE_PATH = 'layoffs.json'
# Fetches layoff news from the last 24 hours
RSS_URL = 'https://news.google.com/rss/search?q="layoffs"+OR+"job+cuts"+when:1d&hl=en-US&gl=US&ceid=US:en'

def load_data():
    if os.path.exists(JSON_FILE_PATH):
        with open(JSON_FILE_PATH, 'r', encoding='utf-8') as f:
            try:
                return json.load(f)
            except Exception:
                return []
    return []

def save_data(data):
    data.sort(key=lambda x: x.get('date', '1970-01-01'), reverse=True)
    with open(JSON_FILE_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

def main():
    print("Fetching news...")
    req = urllib.request.Request(RSS_URL, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req) as response:
            root = ET.fromstring(response.read())
    except Exception as e:
        print(f"Failed to fetch news: {e}")
        return

    data = load_data()
    added = 0
    today = datetime.now().strftime("%Y-%m-%d")

    # Read top 10 articles
    for article in root.findall('.//item')[:10]:
        title = article.find('title').text
        link = article.find('link').text
        
        # Check if we already added a layoff for this exact link
        if any(item.get('link') == link for item in data):
            continue

        prompt = f"""
        Read this news title: {title}
        If it announces a specific company laying off employees, return JSON:
        {{"id": {int(time.time())}, "company": "Name", "date": "{today}", "number": 100, "roles": "Roles", "link": "{link}"}}
        If no specific company or layoff, return null. ONLY return valid JSON or null.
        """
        
        try:
            res = model.generate_content(prompt).text.strip()
            
            if res != "null" and "{" in res:
                # Clean up markdown if AI added it
                if res.startswith("```json"):
                    res = res[7:-3]
                elif res.startswith("```"):
                    res = res[3:-3]
                
                new_item = json.loads(res)
                company_name = new_item.get('company', '')
                
                if company_name:
                    # Double check company isn't already recently added
                    is_duplicate = False
                    for existing_item in data[:20]:
                        if existing_item.get('company', '').lower() == company_name.lower():
                            is_duplicate = True
                            break
                    
                    if not is_duplicate:
                        data.append(new_item)
                        added += 1
                        print(f"✅ Added new layoff: {company_name}")
                        
        except Exception as e:
            print(f"Error analyzing article: {e}")
            
        time.sleep(3) # Don't overload the free API

    if added > 0:
        save_data(data)
        print(f"Successfully updated JSON with {added} new records.")
    else:
        print("No new layoffs found right now.")

if __name__ == "__main__":
    main()
