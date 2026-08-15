-- Rename the public project/release title without changing its stable route slug.
update public.music_releases
set title = '이밤의 도수'
where project_slug = 'ibyeol-ui-dosu'
  and release_number = 1
  and title = '이별의 도수';
