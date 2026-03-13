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
# Using Gemini 2.5 Flash for fast, accurate text analysis
model = genai.GenerativeModel('gemini-2.5-flash')

JSON_FILE_PATH = 'layoffs.json'
# Fetches layoff news from the last 6 months
RSS_URL = 'https://news.google.com/rss/search?q="layoffs"+OR+"job+cuts"+when:6m&hl=en-US&gl=US&ceid=US:en'

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
    print("Fetching historical news for the last 6 months...")
    req = urllib.request.Request(RSS_URL, headers={'User-Agent': 'Mozilla/5.0'})
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
        
        # Get the article snippet/description to give the AI actual context
        description_node = article.find('description')
        description = description_node.text if description_node is not None else ""
        
        # Get publication date to pass to AI for accurate historical dating
        pub_date_node = article.find('pubDate')
        pub_date = pub_date_node.text if pub_date_node is not None else datetime.now().strftime("%Y-%m-%d")
        
        # Check if we already processed this exact article link
        if any(item.get('link') == link for item in data):
            continue

        # Upgraded Analyst Prompt
        prompt = f"""
        You are a Data Analyst tracking corporate layoffs. Read the following news title and article snippet:
        
        Title: {title}
        Snippet: {description}
        Publication Date: {pub_date}
        
        TASK:
        Evaluate the text carefully. Does it announce a specific company laying off employees or cutting jobs?
        - If YES: Extract the data. If the text gives a percentage (e.g., "10% of 10,000 employees"), calculate the actual number. If the exact number is completely missing, use null.
        - If NO (e.g., general economy news, hiring news, or opinion pieces): Return the exact word "null".
        
        Return ONLY valid JSON matching this schema (no markdown formatting, no backticks, no extra text):
        {{"id": {int(time.time())}, "company": "Company Name", "date": "YYYY-MM-DD (Convert Publication Date)", "number": 1000, "roles": "Roles impacted (or 'Unknown')", "link": "{link}"}}
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
                
                if company_name and company_name.lower() != "unknown":
                    # Check the last 40 entries to prevent duplicating the same event reported by different news outlets
                    is_duplicate = False
                    for existing_item in data[:40]:
                        if existing_item.get('company', '').lower() == company_name.lower():
                            is_duplicate = True
                            break
                    
                    if not is_duplicate:
                        data.append(new_item)
                        added += 1
                        print(f"✅ Extracted Layoff: {company_name} | Roles: {new_item.get('roles')} | Count: {new_item.get('number')}")
                        
        except Exception as e:
            # Silently skip AI parsing errors to keep the loop moving
            pass
            
        # Sleep for 4 seconds to ensure we stay under the 15 Requests Per Minute free tier limit
        time.sleep(4) 

    if added > 0:
        save_data(data)
        print(f"Successfully updated JSON with {added} new records.")
    else:
        print("No new layoffs found to add.")

if __name__ == "__main__":
    main()
