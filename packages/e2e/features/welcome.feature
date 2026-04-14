Feature: Welcome Page
  As a new user launching Magenta IDE for the first time
  I want to see a welcome page with onboarding guidance
  So that I know how to get started

  Background:
    Given the app is launched with an empty home directory

  Scenario: Welcome page is shown on first launch
    Then I should see the heading "Welcome to Magenta IDE"
    And I should see a button labeled "Add Working Directory"
    And I should see the tip about scanning 3 levels deep

  Scenario: Add Working Directory button is clickable
    Then the "Add Working Directory" button should be enabled
