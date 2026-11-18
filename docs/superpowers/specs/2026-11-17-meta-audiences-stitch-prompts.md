# Stitch prompts: Audiences page (run in project 13117286791417011091, design system assets/13928921589093913717)

## Phone (390px)

Sales Hub Admin - Audiences (Mobile 390px). An admin page inside the PZ Academy admin app, matching the existing "Affiliates Admin" mobile screens in this project: same top bar, same bottom navigation, same cards, chips and buttons, calm and plain, no exclamation marks, no sales words.

Page title: "Audiences". Subtitle: "Build a list of people for Meta ads. Choose who to include, check the count, then download."

Top row: a text button "Bring in from landing pages" (opens a sheet) and a select "Saved audiences" showing "Gulf recorded buyers" with a chevron.

Section "Who to include" as a vertical stack of filter cards, each with a label and chips:
1. "Course" - helper "Pick one or several. A person matches if they registered for any of them." Chips: "Pharmacovigilance" (selected), "OPD Practice" (selected), "Diabetes Care", "Dose Calculations", "Add course".
2. "Recorded or live" - segmented control: "Either", "Recorded" (selected), "Live". Note: "People from old imported sheets have no recorded or live value, so they are left out when you pick one."
3. "Country" - chips: "UAE" (selected), "Saudi Arabia" (selected), "Pakistan", "Not known (412)". Note: "Country comes from the phone number."
4. "Who" - segmented control: "Paid" (selected), "Registered, not paid", "Both".
5. "Registered between" - two date fields "From" and "To", empty, hint "Leave empty for any date."

Result card, sticky above the bottom navigation: "1,284 people match" / "1,196 will go in the file" / "88 left out: 61 have no email or phone, 27 asked not to be contacted". Buttons: primary "Download for Meta", secondary "Download plain version" with a lock icon and note "The plain file has real emails and phone numbers. Keep it private and delete it after uploading." Text button "Save this audience" reveals a name field (placeholder "Name, for example Gulf recorded buyers") and a "Save" button. Also a "Reset filters" text button. Touch targets at least 44px. Single column, no horizontal scroll.

## PC (1440px)

Same page as "Sales Hub Admin - Audiences (Desktop 1440px)", matching the existing "Affiliates Admin" desktop screens (sidebar, top bar, cards). Two columns: left column (about 2/3) holds the five filter cards (Course, Recorded or live, Country, Who, Registered between) with the same labels, chips, notes and example values as the phone version; right column (about 1/3) holds a sticky result card with the three count lines and the Download for Meta, Download plain version (lock icon and privacy note) and Save this audience controls. Header row: title "Audiences", subtitle as above, "Bring in from landing pages" button and "Saved audiences" select on the right. Above the page title, a tab strip: "Cohorts | Audiences | Import a sheet | Merge review" with Audiences active.

## Bring-in sheet (phone and PC)

"Bring in from landing pages": a sheet (bottom sheet on phone, side panel on PC) titled "Bring in from landing pages". Text: "Copy people who registered on landing pages into the CRM. Safe to press again." A checklist of landing pages with counts (e.g. "Pharmacovigilance - Batch 3, 212 people", "OPD Practice - Batch 1, 96 people"), a "Select all" link, and buttons "Bring in" (primary) and "Cancel". After running, a result line: "Brought in 180. Already there 28. Left out 4: no email or phone."
