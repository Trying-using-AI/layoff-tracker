import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
import json
import os
import time
from datetime import datetime
import re
import google.generativeai as genai

API_KEY = os.environ.get("GEMINI_API_KEY")
if not API_KEY:
    print("API Key not found. Exiting.")
    exit(1)

genai.configure(api_key=API_KEY)
# Using Gemini 2.5 Flash for fast, accurate text analysis
model = genai.GenerativeModel('gemini-2.5-flash')

JSON_FILE_PATH = 'layoffs.json'

# FIX 1: Hardcode a safe, reliable Google News RSS URL (last 180 days)
# URL encoding the colon in "when:180d" breaks Google News, so we use the raw string format
RSS_URL = 'https://news.google.com/rss/search?q=layoffs+when:180d&hl=en-US&gl=US&ceid=US:en'

def load_data():
    if os.path.exists(JSON_FILE_PATH):
        with open(JSON_FILE_PATH, 'r', encoding='utf-8') as f:
            try:
                return json.load(f)
            except Exception:
                return []
    return []

def save_data(data):
    # Sort data by date, newest first
    data.sort(key=lambda x: x.get('date', '1970-01-01'), reverse=True)
    with open(JSON_FILE_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

def main():
    print("Fetching historical news for the last 180 days...")
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    
    req = urllib.request.Request(RSS_URL, headers=headers)
    try:
        with urllib.request.urlopen(req) as response:
            root = ET.fromstring(response.read())
    except Exception as e:
        print(f"Failed to fetch news: {e}")
        return

    data = load_data()
    added = 0

    # Read top 100 articles
    articles = root.findall('.//item')[:100]
    print(f"Found {len(articles)} articles. Scanning...")

    for article in articles:
        title = article.find('title').text
        link = article.find('link').text
        
        # Get the article snippet/description
        description_node = article.find('description')
        raw_desc = description_node.text if description_node is not None else ""
        
        # Strip HTML tags out of the Google News description so AI can read plain text
        clean_desc = re.sub(r'<[^>]+>', ' ', raw_desc).strip()
        
        # Get publication date to pass to AI for accurate historical dating
        pub_date_node = article.find('pubDate')
        pub_date = pub_date_node.text if pub_date_node is not None else datetime.now().strftime("%Y-%m-%d")
        
        # Check if we already processed this exact article link
        if any(item.get('link') == link for item in data):
            continue

        # Upgraded Analyst Prompt with stricter number constraints
        prompt = f"""
        You are a Data Analyst tracking corporate layoffs. Read the following news title and clean article snippet:
        
        Title: {title}
        Snippet: {clean_desc}
        Publication Date: {pub_date}
        
        TASK:
        Evaluate the text carefully. Does it announce a specific company laying off employees or cutting jobs?
        - If YES: Extract the data. For "number", you MUST find the actual integer count of employees laid off (e.g., 1600, 4000). If the exact numerical count is completely missing, return null. Do NOT guess.
        - If NO (e.g., general economy news, hiring news, or opinion pieces): Return the exact word "null" (without quotes).
        
        Return ONLY valid JSON matching this schema exactly (no markdown formatting, no backticks, no extra text):
        {{"id": {int(time.time())}, "company": "Company Name", "date": "2024-03-12", "number": 1000, "roles": "Roles impacted (or 'Unknown')", "link": "{link}"}}
        """
        
        try:
            res = model.generate_content(prompt).text.strip()
            
            if res.lower() != "null" and "{" in res:
                # Clean up markdown if AI added it
                if res.startswith("```json"):
                    res = res[7:-3]
                elif res.startswith("```"):
                    res = res[3:-3]
                
                new_item = json.loads(res)
                company_name = new_item.get('company', '')
                
                if company_name and company_name.lower() != "unknown":
                    # Better Duplicate Checking (Compare Company AND Date)
                    is_duplicate = False
                    for existing_item in data:
                        if existing_item.get('company', '').lower() == company_name.lower():
                            try:
                                # If the same company has a layoff reported within 14 days, treat it as the same event
                                date_str_exist = existing_item.get('date', '1970-01-01')[:10]
                                date_str_new = new_item.get('date', '1970-01-01')[:10]
                                date_exist = datetime.strptime(date_str_exist, "%Y-%m-%d")
                                date_new = datetime.strptime(date_str_new, "%Y-%m-%d")
                                
                                if abs((date_exist - date_new).days) <= 14:
                                    is_duplicate = True
                                    break
                            except Exception:
                                # If date parsing fails for some reason, ignore duplicate check
                                pass
                    
                    if not is_duplicate:
                        data.append(new_item)
                        added += 1
                        print(f"✅ Extracted Layoff: {company_name} | Roles: {new_item.get('roles')} | Count: {new_item.get('number')}")
            else:
                print(f"⏭️ Skipped: Not a specific layoff announcement.")
                
        except Exception as e:
            # FIX 3: Print the error so we can debug it if the AI fails
            print(f"⚠️ Error parsing article '{title[:30]}...': {e}")
            
        # FIX 4: Sleep for 5 seconds to ensure we safely stay under Gemini's 15 RPM free tier limit
        time.sleep(5) 

    if added > 0:
        save_data(data)
        print(f"\n🎉 Successfully updated JSON with {added} new records.")
    else:
        print("\n👍 No new layoffs found to add.")

if __name__ == "__main__":
